import { Logger } from "@nestjs/common";
import {
  encodeSlugForUrl,
  postIdSchema,
  publicImageSchema,
  type Locale,
  type PublicImage,
} from "@portfolio/contracts/common";
import {
  publicArticleDetailSchema,
  publicArticleHeadingSchema,
  publicArticleListSchema,
  publicArticleTaxonomyListSchema,
  publicBlogTaxonomyIndexSchema,
  publicFeedIndexSchema,
  type PublicArticleAlternate,
  type PublicArticleDetail,
  type PublicArticleList,
  type PublicArticleSummary,
  type PublicArticleTaxonomyList,
  type PublicBlogTaxonomyIndex,
  type PublicFeedIndex,
  type PublicTaxonomyKind,
} from "@portfolio/contracts/blog";
import { articleSourceSha256Schema } from "@portfolio/contracts/content";
import type { Database } from "@portfolio/database";

import type { PublicMediaReader } from "./public-media.reader.js";
import { RENDERER_VERSION } from "@portfolio/markdown";
import { z } from "zod";
import { createHash } from "node:crypto";

const articleCursorSchema = z
  .object({
    publishedAt: z.iso.datetime({ offset: true }),
    id: z.string().min(1).max(128),
  })
  .strict();

export class InvalidPublicArticleCursorError extends Error {
  public constructor() {
    super("The public article cursor is invalid.");
    this.name = "InvalidPublicArticleCursorError";
  }
}

export interface PublicArticleListRead {
  readonly data: PublicArticleList;
  readonly nextCursor: string | null;
  readonly lastModified: Date;
}

export type PublicArticleTaxonomyRead =
  | {
      readonly kind: "found";
      readonly data: PublicArticleTaxonomyList;
      readonly nextCursor: string | null;
      readonly lastModified: Date;
    }
  | { readonly kind: "missing" };

export interface PublicBlogTaxonomyIndexRead {
  readonly data: PublicBlogTaxonomyIndex;
  readonly lastModified: Date;
}

export interface PublicArticleImageRead {
  readonly mimeType: "image/jpeg" | "image/png" | "image/webp";
  readonly checksumSha256: string;
  readonly lastModified: Date;
  readonly readBytes: () => Promise<Uint8Array>;
}

export interface PublicFeedIndexRead {
  readonly data: PublicFeedIndex;
  readonly nextCursor: string | null;
  readonly lastModified: Date;
}

export type PublicArticleDetailRead =
  | {
      readonly kind: "found";
      readonly data: PublicArticleDetail;
      readonly lastModified: Date;
    }
  | {
      readonly kind: "missing";
      readonly availableTranslations: readonly PublicArticleAlternate[];
    };

/**
 * Faults are recorded here and nowhere else. An operator needs to know a row
 * went dark; a visitor must not be able to tell the difference between a
 * corrupted article and one that was never written.
 *
 * Module-scoped rather than a class member because the pure row-to-DTO helpers
 * below report the same class of fault and are deliberately not methods.
 */
const logger = new Logger("PublicArticlesService");

/** Published article reads from authoritative PostgreSQL source/render state. */
export class PublicArticlesService {
  public constructor(
    private readonly database: Database,
    private readonly media: PublicMediaReader
  ) {}

  /**
   * Page rows to summaries, dropping the ones that cannot be trusted.
   *
   * Filtered after the page is sliced, never before: the cursor advances by
   * the last *row* on the page, so dropping a faulty row shortens the page
   * without skipping the next one.
   */
  private toSummaries(
    rows: readonly SummaryRow[],
    locale: Locale
  ): readonly PublicArticleSummary[] {
    return rows
      .filter((row) => {
        const fault = renderFault(row);
        if (fault === null) return true;
        logger.error(
          `Excluding article translation ${row.post.id}/${locale} from public discovery: ${fault}.`
        );
        return false;
      })
      .map((row) =>
        toSummary({
          ...row,
          id: row.post.id,
          tagKeys: row.post.tags
            .filter(({ tag }) => tag.enabled)
            .map(({ tag }) => tag.key)
            .sort(),
        })
      );
  }

  async list(
    locale: Locale,
    options: { readonly limit: number; readonly cursor?: string | undefined }
  ): Promise<PublicArticleListRead> {
    const cursor =
      options.cursor === undefined ? undefined : decodeCursor(options.cursor);
    const rows = await this.database.postTranslation.findMany({
      where: {
        locale,
        ...PUBLISHED_TRANSLATION,
        post: { archivedAt: null },
        ...cursorWhere(cursor),
      },
      orderBy: publishedOrder(),
      take: options.limit + 1,
      select: SUMMARY_SELECT,
    });

    // Filtered after the page is sliced, never before: the cursor advances by
    // the last *row* on the page, so dropping a faulty row shortens the page
    // without skipping the next one.
    const pageRows = rows.slice(0, options.limit);
    const posts = this.toSummaries(pageRows, locale);
    const last = pageRows.at(-1);
    const nextCursor =
      rows.length > options.limit && last?.publishedAt
        ? encodeCursor(last.publishedAt, last.id)
        : null;

    return {
      data: publicArticleListSchema.parse({ locale, posts }),
      nextCursor,
      lastModified: latestDate(
        pageRows.flatMap((row) => [row.updatedAt, row.post.updatedAt])
      ),
    };
  }

  /**
   * One category or tag page.
   *
   * The taxonomy row is resolved first and independently: a disabled category
   * is not "a category with no articles", it is a URL that must not exist, and
   * answering it with an empty list would leave a crawlable page behind after
   * an editor deliberately withdrew the term. `missing` is the controller's
   * cue to answer `404`.
   *
   * Filtering happens on the *post* rather than on the article summary's
   * `categoryKey`, because the summary reports a disabled category as `null`
   * and a filter built on that would quietly return the wrong set.
   */
  async listByTaxonomy(
    locale: Locale,
    kind: PublicTaxonomyKind,
    slug: string,
    options: { readonly limit: number; readonly cursor?: string | undefined }
  ): Promise<PublicArticleTaxonomyRead> {
    const cursor =
      options.cursor === undefined ? undefined : decodeCursor(options.cursor);
    const taxonomy =
      kind === "category"
        ? await this.database.categoryTranslation.findUnique({
            where: { locale_slug: { locale, slug } },
            select: {
              name: true,
              slug: true,
              description: true,
              updatedAt: true,
              category: {
                select: {
                  key: true,
                  enabled: true,
                  translations: { select: { locale: true, slug: true } },
                },
              },
            },
          })
        : await this.database.tagTranslation.findUnique({
            where: { locale_slug: { locale, slug } },
            select: {
              name: true,
              slug: true,
              description: true,
              updatedAt: true,
              tag: {
                select: {
                  key: true,
                  enabled: true,
                  translations: { select: { locale: true, slug: true } },
                },
              },
            },
          });
    if (taxonomy === null) return { kind: "missing" };
    const term = "category" in taxonomy ? taxonomy.category : taxonomy.tag;
    if (!term.enabled) return { kind: "missing" };

    const rows = await this.database.postTranslation.findMany({
      where: {
        locale,
        ...PUBLISHED_TRANSLATION,
        // Filtered on the post, never on the summary's `categoryKey`: the
        // summary reports a disabled term as `null`, so a filter built on it
        // would quietly answer with the wrong set.
        post:
          kind === "category"
            ? {
                archivedAt: null,
                category: { is: { key: term.key, enabled: true } },
              }
            : {
                archivedAt: null,
                tags: {
                  some: { tag: { is: { key: term.key, enabled: true } } },
                },
              },
        ...cursorWhere(cursor),
      },
      orderBy: publishedOrder(),
      take: options.limit + 1,
      select: SUMMARY_SELECT,
    });

    const pageRows = rows.slice(0, options.limit);
    const posts = this.toSummaries(pageRows, locale);
    const last = pageRows.at(-1);

    return {
      kind: "found",
      data: publicArticleTaxonomyListSchema.parse({
        locale,
        taxonomy: {
          kind,
          key: term.key,
          slug: taxonomy.slug,
          name: taxonomy.name,
          description: taxonomy.description,
          alternates: toTermAlternates(term.translations),
        },
        posts,
      }),
      nextCursor:
        rows.length > options.limit && last?.publishedAt
          ? encodeCursor(last.publishedAt, last.id)
          : null,
      lastModified: latestDate([
        taxonomy.updatedAt,
        ...pageRows.flatMap((row) => [row.updatedAt, row.post.updatedAt]),
      ]),
    };
  }

  /**
   * The ordered entries a feed or a sitemap is generated from.
   *
   * It carries `alternates` and the listing does not, because a sitemap
   * entry's `xhtml:link` set has to match the article page's emitted
   * `hreflang` set exactly, and the only way to guarantee that is for both to
   * come from the same published-translation query. The current locale is
   * included in its own alternate list so a consumer never has to add itself
   * back in and cannot forget to.
   */
  async feedIndex(
    locale: Locale,
    options: { readonly limit: number; readonly cursor?: string | undefined }
  ): Promise<PublicFeedIndexRead> {
    const cursor =
      options.cursor === undefined ? undefined : decodeCursor(options.cursor);
    const rows = await this.database.postTranslation.findMany({
      where: {
        locale,
        ...PUBLISHED_TRANSLATION,
        post: { archivedAt: null },
        ...cursorWhere(cursor),
      },
      orderBy: publishedOrder(),
      take: options.limit + 1,
      select: {
        ...SUMMARY_SELECT,
        post: {
          select: {
            ...SUMMARY_SELECT.post.select,
            translations: {
              where: PUBLISHED_ALTERNATE_WHERE,
              select: { locale: true, slug: true, updatedAt: true },
            },
          },
        },
      },
    });

    const pageRows = rows.slice(0, options.limit);
    const entries = pageRows
      .filter((row) => {
        const fault = renderFault(row);
        if (fault === null) return true;
        logger.error(
          `Excluding article translation ${row.post.id}/${locale} from the feed index: ${fault}.`
        );
        return false;
      })
      .map((row) => ({
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt,
        publishedAt: row.publishedAt?.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        authorName: row.post.author?.displayName ?? null,
        categoryKey:
          row.post.category?.enabled === true ? row.post.category.key : null,
        tagKeys: row.post.tags
          .filter(({ tag }) => tag.enabled)
          .map(({ tag }) => tag.key)
          .sort(),
        alternates: row.post.translations
          .map(({ locale: alternateLocale, slug: alternateSlug }) => ({
            locale: alternateLocale,
            slug: alternateSlug,
          }))
          .sort(({ locale: left }, { locale: right }) =>
            left.localeCompare(right)
          ),
      }));
    const last = pageRows.at(-1);

    return {
      data: publicFeedIndexSchema.parse({ locale, entries }),
      nextCursor:
        rows.length > options.limit && last?.publishedAt
          ? encodeCursor(last.publishedAt, last.id)
          : null,
      lastModified: latestDate(
        pageRows.flatMap((row) => [row.updatedAt, row.post.updatedAt])
      ),
    };
  }

  /**
   * The terms a visitor can actually navigate to, with honest counts.
   *
   * Counted from the articles themselves rather than with a SQL aggregate,
   * because the integrity rule that decides whether an article is
   * discoverable — does its stored digest still match its stored source —
   * cannot be expressed in the query. An aggregate would therefore count rows
   * the article listing refuses, and the index would advertise a category
   * whose page renders empty.
   *
   * Bounded at `TAXONOMY_SCAN_LIMIT` translations. That is a ceiling on the
   * navigation index only; the listing, taxonomy pages, and feed index all
   * paginate and are unaffected.
   */
  async taxonomyIndex(locale: Locale): Promise<PublicBlogTaxonomyIndexRead> {
    const rows = await this.database.postTranslation.findMany({
      where: {
        locale,
        ...PUBLISHED_TRANSLATION,
        post: { archivedAt: null },
      },
      orderBy: publishedOrder(),
      take: TAXONOMY_SCAN_LIMIT,
      select: SUMMARY_SELECT,
    });

    const categoryCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();
    for (const row of rows) {
      if (renderFault(row) !== null) continue;
      if (row.post.category?.enabled === true) {
        const key = row.post.category.key;
        categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
      }
      for (const { tag } of row.post.tags) {
        if (!tag.enabled) continue;
        tagCounts.set(tag.key, (tagCounts.get(tag.key) ?? 0) + 1);
      }
    }

    const [categories, tags] = await Promise.all([
      categoryCounts.size === 0
        ? []
        : this.database.categoryTranslation.findMany({
            where: {
              locale,
              category: {
                is: { enabled: true, key: { in: [...categoryCounts.keys()] } },
              },
            },
            select: {
              name: true,
              slug: true,
              description: true,
              updatedAt: true,
              category: {
                select: {
                  key: true,
                  sortOrder: true,
                  translations: { select: { locale: true, slug: true } },
                },
              },
            },
          }),
      tagCounts.size === 0
        ? []
        : this.database.tagTranslation.findMany({
            where: {
              locale,
              tag: {
                is: { enabled: true, key: { in: [...tagCounts.keys()] } },
              },
            },
            select: {
              name: true,
              slug: true,
              description: true,
              updatedAt: true,
              tag: {
                select: {
                  key: true,
                  sortOrder: true,
                  translations: { select: { locale: true, slug: true } },
                },
              },
            },
          }),
    ]);

    return {
      data: publicBlogTaxonomyIndexSchema.parse({
        locale,
        categories: categories
          .sort((left, right) =>
            compareTerms(
              { sortOrder: left.category.sortOrder, name: left.name },
              { sortOrder: right.category.sortOrder, name: right.name }
            )
          )
          .map((row) => ({
            kind: "category" as const,
            key: row.category.key,
            slug: row.slug,
            name: row.name,
            description: row.description,
            alternates: toTermAlternates(row.category.translations),
            articleCount: categoryCounts.get(row.category.key) ?? 0,
          })),
        tags: tags
          .sort((left, right) =>
            compareTerms(
              { sortOrder: left.tag.sortOrder, name: left.name },
              { sortOrder: right.tag.sortOrder, name: right.name }
            )
          )
          .map((row) => ({
            kind: "tag" as const,
            key: row.tag.key,
            slug: row.slug,
            name: row.name,
            description: row.description,
            alternates: toTermAlternates(row.tag.translations),
            articleCount: tagCounts.get(row.tag.key) ?? 0,
          })),
      }),
      lastModified: latestDate([
        ...rows.map((row) => row.updatedAt),
        ...categories.map((row) => row.updatedAt),
        ...tags.map((row) => row.updatedAt),
      ]),
    };
  }

  async detail(locale: Locale, slug: string): Promise<PublicArticleDetailRead> {
    const row = await this.database.postTranslation.findUnique({
      where: { locale_slug: { locale, slug } },
      select: {
        slug: true,
        title: true,
        excerpt: true,
        seoTitle: true,
        seoDescription: true,
        canonicalUrl: true,
        status: true,
        publishedAt: true,
        readingMinutes: true,
        headingTree: true,
        renderedHtml: true,
        rendererVersion: true,
        bodyMarkdown: true,
        bodySha256: true,
        updatedAt: true,
        archivedAt: true,
        socialImage: { select: PUBLIC_IMAGE_SELECT },
        post: {
          select: {
            id: true,
            featured: true,
            updatedAt: true,
            archivedAt: true,
            author: { select: { displayName: true } },
            category: { select: { key: true, enabled: true } },
            coverMedia: { select: PUBLIC_IMAGE_SELECT },
            tags: {
              select: { tag: { select: { key: true, enabled: true } } },
            },
            translations: {
              where: PUBLISHED_ALTERNATE_WHERE,
              select: { locale: true, slug: true, updatedAt: true },
            },
          },
        },
      },
    });

    if (row === null || row.post.archivedAt !== null) {
      return { kind: "missing", availableTranslations: [] };
    }

    const availableTranslations = row.post.translations
      .map(({ locale: alternateLocale, slug: alternateSlug }) => ({
        locale: alternateLocale,
        slug: alternateSlug,
      }))
      .sort(({ locale: left }, { locale: right }) => left.localeCompare(right));

    if (
      row.status !== "PUBLISHED" ||
      row.archivedAt !== null ||
      row.publishedAt === null
    ) {
      return { kind: "missing", availableTranslations };
    }
    if (!isRenderable(row)) {
      logger.error(
        `Refusing article translation ${row.post.id}/${locale} on the public detail path: ${renderFault(row)}.`
      );
      return { kind: "missing", availableTranslations };
    }

    const headings = z
      .array(publicArticleHeadingSchema)
      .max(100)
      .parse(row.headingTree);
    const post: PublicArticleSummary & {
      readonly seoTitle: string | null;
      readonly seoDescription: string | null;
      readonly canonicalUrl: string | null;
      readonly socialImage: PublicImage | null;
      readonly renderedHtml: string;
      readonly headings: typeof headings;
      readonly alternates: typeof availableTranslations;
    } = {
      ...toSummary({
        ...row,
        id: row.post.id,
        featured: row.post.featured,
        authorName: row.post.author?.displayName ?? null,
        categoryKey:
          row.post.category?.enabled === true ? row.post.category.key : null,
        tagKeys: row.post.tags
          .filter(({ tag }) => tag.enabled)
          .map(({ tag }) => tag.key)
          .sort(),
      }),
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      canonicalUrl: row.canonicalUrl,
      // The translation's own social image wins over the post-level cover:
      // the cover belongs to both locales, and an author who set a Persian
      // card deliberately meant it to replace the shared one.
      socialImage:
        toPublicImage(row.socialImage, locale, row.slug, row.title, "social") ??
        toPublicImage(
          row.post.coverMedia,
          locale,
          row.slug,
          row.title,
          "cover"
        ),
      renderedHtml: row.renderedHtml,
      headings,
      alternates: availableTranslations,
    };

    return {
      kind: "found",
      data: publicArticleDetailSchema.parse({ locale, post }),
      lastModified: latestDate([
        row.updatedAt,
        row.post.updatedAt,
        ...row.post.translations.map(({ updatedAt }) => updatedAt),
      ]),
    };
  }

  /**
   * The bytes behind an article's social card.
   *
   * Gated on the *article* being publicly readable, not only on the media row
   * being verified: a cover attached to a draft is not published content, and
   * an endpoint that served it would be a preview channel that needs no
   * session. The same social-then-cover precedence as the detail DTO, so the
   * path the DTO advertises is the image the DTO described.
   */
  async readImage(
    locale: Locale,
    slug: string
  ): Promise<PublicArticleImageRead | null> {
    const row = await this.database.postTranslation.findFirst({
      where: {
        locale,
        slug,
        ...PUBLISHED_TRANSLATION,
        post: { archivedAt: null },
      },
      select: {
        updatedAt: true,
        socialImage: { select: MEDIA_OBJECT_SELECT },
        post: {
          select: {
            updatedAt: true,
            coverMedia: { select: MEDIA_OBJECT_SELECT },
          },
        },
      },
    });
    if (row === null) return null;
    const image =
      servableMedia(row.socialImage) ?? servableMedia(row.post.coverMedia);
    if (image === null) return null;

    const expectedSize = Number(image.byteSize);
    if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) {
      throw new Error("A public article image has an invalid byte size.");
    }
    if (!/^[0-9a-f]{64}$/i.test(image.checksumSha256)) {
      throw new Error("A public article image has an invalid checksum.");
    }

    return {
      mimeType: parseImageMimeType(image.mimeType),
      checksumSha256: image.checksumSha256,
      lastModified: latestDate([
        row.updatedAt,
        row.post.updatedAt,
        image.updatedAt,
      ]),
      readBytes: async () => {
        const bytes = await this.media.read(image.storageKey);
        if (bytes.byteLength !== expectedSize) {
          throw new Error(
            "A public article image object does not match its metadata."
          );
        }
        return bytes;
      },
    };
  }
}

/** The same eligibility columns, plus what it takes to fetch the object. */
const MEDIA_OBJECT_SELECT = {
  storageKey: true,
  mimeType: true,
  byteSize: true,
  checksumSha256: true,
  updatedAt: true,
  kind: true,
  processingState: true,
  visibility: true,
  archivedAt: true,
} as const;

interface MediaObjectRow {
  readonly storageKey: string;
  readonly mimeType: string;
  readonly byteSize: bigint;
  readonly checksumSha256: string;
  readonly updatedAt: Date;
  readonly kind: string;
  readonly processingState: string;
  readonly visibility: string;
  readonly archivedAt: Date | null;
}

/** Verified, public, unarchived image rows only. Anything else is absent. */
function servableMedia(image: MediaObjectRow | null): MediaObjectRow | null {
  if (
    image === null ||
    image.kind !== "IMAGE" ||
    image.processingState !== "VERIFIED" ||
    image.visibility !== "PUBLIC" ||
    image.archivedAt !== null
  ) {
    return null;
  }
  return image;
}

/**
 * The narrow set of image types the ingestion boundary verifies.
 *
 * A throw rather than a fallback: reaching here means a row passed
 * verification with a type the public contract does not allow, which is a
 * database-integrity fault an operator has to see, not a response to improvise.
 */
function parseImageMimeType(
  value: string
): "image/jpeg" | "image/png" | "image/webp" {
  if (
    value === "image/jpeg" ||
    value === "image/png" ||
    value === "image/webp"
  ) {
    return value;
  }
  throw new Error(
    "A verified public article image has an unsupported MIME type."
  );
}

/** Everything needed to decide whether a media row may be shown, and how. */
const PUBLIC_IMAGE_SELECT = {
  mimeType: true,
  altText: true,
  width: true,
  height: true,
  kind: true,
  processingState: true,
  visibility: true,
  archivedAt: true,
} as const;

interface PublicImageRow {
  readonly mimeType: string;
  readonly altText: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly kind: string;
  readonly processingState: string;
  readonly visibility: string;
  readonly archivedAt: Date | null;
}

/**
 * A media row as a social card may use it, or `null`.
 *
 * Unverified, private, archived, non-image, or oddly-typed media is `null`
 * rather than an error, for the same reason a corrupted article is absent
 * rather than a `500`: the page is still publishable without a card, and one
 * bad media row must not take an article's whole detail response with it. The
 * dimensions are dropped together when either is missing, because a card that
 * declares one of the two is worse than one that declares neither.
 */
function toPublicImage(
  image: PublicImageRow | null,
  locale: Locale,
  slug: string,
  title: string,
  kind: "social" | "cover"
): PublicImage | null {
  if (
    image === null ||
    image.kind !== "IMAGE" ||
    image.processingState !== "VERIFIED" ||
    image.visibility !== "PUBLIC" ||
    image.archivedAt !== null
  ) {
    return null;
  }
  const dimensionsKnown =
    typeof image.width === "number" &&
    typeof image.height === "number" &&
    Number.isSafeInteger(image.width) &&
    Number.isSafeInteger(image.height) &&
    image.width > 0 &&
    image.height > 0;
  const candidate = {
    src: `/api/v1/public/${locale}/blog/posts/${encodeSlugForUrl(slug)}/image`,
    altText:
      image.altText?.trim() ||
      (kind === "social" ? `${title} social image` : `${title} cover image`),
    mimeType: image.mimeType,
    width: dimensionsKnown ? image.width : null,
    height: dimensionsKnown ? image.height : null,
  };
  const parsed = publicImageSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  logger.error(
    `Omitting the ${kind} image for article ${locale}/${slug}: it does not satisfy the public image contract.`
  );
  return null;
}

/**
 * The columns every discovery read projects.
 *
 * One constant rather than three copies, because the integrity check below
 * treats a column that was not selected as "not a fault" — a listing that
 * silently stopped selecting `bodySha256` would therefore stop verifying it,
 * and nothing would fail.
 */
const SUMMARY_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  publishedAt: true,
  readingMinutes: true,
  updatedAt: true,
  bodyMarkdown: true,
  bodySha256: true,
  post: {
    select: {
      id: true,
      featured: true,
      updatedAt: true,
      author: { select: { displayName: true } },
      category: { select: { key: true, enabled: true } },
      tags: {
        select: { tag: { select: { key: true, enabled: true } } },
      },
    },
  },
} as const;

type SummaryRow = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string | null;
  readonly publishedAt: Date | null;
  readonly readingMinutes: number | null;
  readonly updatedAt: Date;
  readonly bodyMarkdown: string | null;
  readonly bodySha256: string | null;
  readonly post: {
    readonly id: string;
    readonly featured: boolean;
    readonly updatedAt: Date;
    readonly author: { readonly displayName: string } | null;
    readonly category: {
      readonly key: string;
      readonly enabled: boolean;
    } | null;
    readonly tags: readonly {
      readonly tag: { readonly key: string; readonly enabled: boolean };
    }[];
  };
};

/**
 * The predicate for an alternate that may be linked to.
 *
 * Narrower than "published": an `hreflang` pointing at a translation the
 * detail route would refuse is a link to a `404` that a crawler will keep
 * re-requesting, so provenance is part of the eligibility rule rather than
 * something checked after the link is emitted.
 */
const PUBLISHED_ALTERNATE_WHERE = {
  status: "PUBLISHED",
  archivedAt: null,
  publishedAt: { not: null },
  bodyMarkdown: { not: null },
  bodySha256: { not: null },
  rendererVersion: RENDERER_VERSION,
} as const;

/**
 * The published-and-renderable predicate every discovery read shares.
 *
 * Spread into each `where` rather than returned from a builder so the literal
 * types survive into Prisma's own argument checking — a builder that returned
 * a widened object would compile against any column name at all.
 */
const PUBLISHED_TRANSLATION = {
  status: "PUBLISHED",
  archivedAt: null,
  publishedAt: { not: null },
  excerpt: { not: null },
  readingMinutes: { not: null },
  renderedHtml: { not: null },
  rendererVersion: RENDERER_VERSION,
  bodyMarkdown: { not: null },
  bodySha256: { not: null },
} as const;

/**
 * How many published translations the navigation index scans.
 *
 * The index is one small list on every blog page, so it is read far more
 * often than it changes; an unbounded scan there would be the most expensive
 * query on the most-requested surface.
 */
const TAXONOMY_SCAN_LIMIT = 500;

/**
 * The locales a term actually has a page in, ordered and deduplicated.
 *
 * Sorted so that the `hreflang` set a page emits and the `xhtml:link` set a
 * sitemap emits are byte-identical rather than merely equivalent, which is
 * what makes the two comparable in a test at all.
 */
function toTermAlternates(
  translations: readonly { readonly locale: string; readonly slug: string }[]
): readonly { readonly locale: string; readonly slug: string }[] {
  return [...translations]
    .map(({ locale, slug }) => ({ locale, slug }))
    .sort(({ locale: left }, { locale: right }) => left.localeCompare(right));
}

/** Editor order first, then the localized name, so the list is stable. */
function compareTerms(
  left: { readonly sortOrder: number; readonly name: string },
  right: { readonly sortOrder: number; readonly name: string }
): number {
  return (
    left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)
  );
}

/** Newest first, with the row id as the tie-break the cursor also uses. */
function publishedOrder() {
  return [{ publishedAt: "desc" as const }, { id: "desc" as const }];
}

/**
 * The keyset predicate for one page boundary, or nothing on the first page.
 *
 * Keyset rather than offset for the reason `paginationQuerySchema` gives:
 * publishing one article while a reader is paging would shift every later
 * offset by one row and silently skip an entry.
 */
function cursorWhere(cursor?: {
  readonly publishedAt: string;
  readonly id: string;
}) {
  if (cursor === undefined) return {};
  return {
    OR: [
      { publishedAt: { lt: new Date(cursor.publishedAt) } },
      { publishedAt: new Date(cursor.publishedAt), id: { lt: cursor.id } },
    ],
  };
}

function toSummary(row: {
  readonly id?: string;
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string | null;
  readonly publishedAt: Date | null;
  readonly readingMinutes: number | null;
  readonly updatedAt: Date;
  readonly featured?: boolean;
  readonly authorName?: string | null;
  readonly categoryKey?: string | null;
  readonly tagKeys?: readonly string[];
  readonly post?: {
    readonly id: string;
    readonly featured: boolean;
    readonly author: { readonly displayName: string } | null;
    readonly category: {
      readonly key: string;
      readonly enabled: boolean;
    } | null;
  };
}): PublicArticleSummary {
  if (
    row.excerpt === null ||
    row.publishedAt === null ||
    row.readingMinutes === null
  ) {
    throw new Error("A published article summary is incomplete.");
  }
  return {
    id: postIdSchema.parse(row.id ?? row.post?.id),
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    publishedAt: row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    readingMinutes: row.readingMinutes,
    authorName: row.authorName ?? row.post?.author?.displayName ?? null,
    categoryKey:
      row.categoryKey ??
      (row.post?.category?.enabled === true ? row.post.category.key : null),
    tagKeys: [...(row.tagKeys ?? [])],
    featured: row.featured ?? row.post?.featured ?? false,
  };
}

function encodeCursor(publishedAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ publishedAt: publishedAt.toISOString(), id }),
    "utf8"
  ).toString("base64url");
}

function decodeCursor(cursor: string): z.infer<typeof articleCursorSchema> {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = articleCursorSchema.safeParse(JSON.parse(decoded));
    if (parsed.success) return parsed.data;
  } catch {
    // The stable validation error below deliberately contains no cursor data.
  }
  throw new InvalidPublicArticleCursorError();
}

function latestDate(values: readonly Date[]): Date {
  if (values.length === 0) return new Date(0);
  return new Date(Math.max(...values.map((value) => value.getTime())));
}

/** The fields a translation must actually have before it can be rendered. */
interface RenderableTranslation {
  readonly excerpt: string;
  readonly readingMinutes: number;
  readonly renderedHtml: string;
  readonly rendererVersion: string;
  readonly bodyMarkdown: string;
  readonly bodySha256: string;
}

interface MaybeRenderable {
  readonly excerpt?: string | null;
  readonly readingMinutes?: number | null;
  readonly renderedHtml?: string | null;
  readonly rendererVersion?: string | null;
  readonly bodyMarkdown: string | null;
  readonly bodySha256: string | null;
}

/**
 * Why a published row cannot be served publicly, or null when it can.
 *
 * This returns a reason instead of throwing one. Throwing meant a single
 * corrupted row aborted the entire listing with a `500`, so one bad article
 * became a locale-wide blog outage, and the failure told an unauthenticated
 * caller that something was wrong with the data. Both are worse than the row
 * simply not being there: the public contract for an article whose source
 * cannot be trusted is that it does not exist.
 *
 * The reason is for the server log only. It never reaches a response.
 *
 * Fields absent from a projection are not faults. The listing selects fewer
 * columns than the detail read, and a check that treated "not selected" as
 * "missing" would empty every listing.
 */
function renderFault(row: MaybeRenderable): string | null {
  if (row.bodyMarkdown === null) return "missing source";
  if (!articleSourceSha256Schema.safeParse(row.bodySha256).success) {
    return "malformed source digest";
  }
  if (
    createHash("sha256").update(row.bodyMarkdown, "utf8").digest("hex") !==
    row.bodySha256
  ) {
    return "source digest does not match the stored source";
  }
  if (row.excerpt === null) return "missing excerpt";
  if (row.readingMinutes === null) return "missing reading time";
  if (row.renderedHtml === null) return "missing render";
  if (
    row.rendererVersion !== undefined &&
    row.rendererVersion !== RENDERER_VERSION
  ) {
    return `stale renderer version ${String(row.rendererVersion)}`;
  }
  return null;
}

function isRenderable<Row extends MaybeRenderable>(
  row: Row
): row is Row & RenderableTranslation {
  return renderFault(row) === null;
}

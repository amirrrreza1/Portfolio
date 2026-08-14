import { postIdSchema, type Locale } from "@portfolio/contracts/common";
import {
  publicArticleDetailSchema,
  publicArticleHeadingSchema,
  publicArticleListSchema,
  type PublicArticleAlternate,
  type PublicArticleDetail,
  type PublicArticleList,
  type PublicArticleSummary,
} from "@portfolio/contracts/blog";
import { blobShaSchema } from "@portfolio/contracts/content";
import type { Database } from "@portfolio/database";
import { RENDERER_VERSION } from "@portfolio/markdown";
import { z } from "zod";

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

/** Published article index reads; Git is deliberately absent from this path. */
export class PublicArticlesService {
  public constructor(private readonly database: Database) {}

  async list(
    locale: Locale,
    options: { readonly limit: number; readonly cursor?: string | undefined }
  ): Promise<PublicArticleListRead> {
    const cursor =
      options.cursor === undefined ? undefined : decodeCursor(options.cursor);
    const rows = await this.database.postTranslation.findMany({
      where: {
        locale,
        status: "PUBLISHED",
        syncState: "SYNCED",
        archivedAt: null,
        publishedAt: { not: null },
        excerpt: { not: null },
        readingMinutes: { not: null },
        renderedHtml: { not: null },
        rendererVersion: RENDERER_VERSION,
        sourceBlobSha: { not: null },
        post: { archivedAt: null },
        ...(cursor === undefined
          ? {}
          : {
              OR: [
                { publishedAt: { lt: new Date(cursor.publishedAt) } },
                {
                  publishedAt: new Date(cursor.publishedAt),
                  id: { lt: cursor.id },
                },
              ],
            }),
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: options.limit + 1,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        publishedAt: true,
        readingMinutes: true,
        updatedAt: true,
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
      },
    });

    const pageRows = rows.slice(0, options.limit);
    const posts = pageRows.map((row) =>
      toSummary({
        ...row,
        id: row.post.id,
        tagKeys: row.post.tags
          .filter(({ tag }) => tag.enabled)
          .map(({ tag }) => tag.key)
          .sort(),
      })
    );
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
        sourceBlobSha: true,
        updatedAt: true,
        archivedAt: true,
        post: {
          select: {
            id: true,
            featured: true,
            updatedAt: true,
            archivedAt: true,
            author: { select: { displayName: true } },
            category: { select: { key: true, enabled: true } },
            tags: {
              select: { tag: { select: { key: true, enabled: true } } },
            },
            translations: {
              where: {
                status: "PUBLISHED",
                archivedAt: null,
                publishedAt: { not: null },
              },
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
    if (
      row.excerpt === null ||
      row.readingMinutes === null ||
      row.renderedHtml === null ||
      row.rendererVersion !== RENDERER_VERSION ||
      !blobShaSchema.safeParse(row.sourceBlobSha).success
    ) {
      throw new Error("A published article has an invalid render index.");
    }

    const headings = z
      .array(publicArticleHeadingSchema)
      .max(100)
      .parse(row.headingTree);
    const post: PublicArticleSummary & {
      readonly seoTitle: string | null;
      readonly seoDescription: string | null;
      readonly canonicalUrl: string | null;
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

import {
  articleCacheTags,
  frontmatterSchema,
  invalidationEventSchema,
  saveTranslationSchema,
  type Frontmatter,
  type Locale,
  type SaveTranslation,
} from "@portfolio/contracts";
import { renderArticleBody } from "@portfolio/markdown";
import { createHash, randomUUID } from "node:crypto";

import type { Database } from "./client.js";
import type { ContentJobStore } from "./content-jobs.js";

export class ArticleVersionConflictError extends Error {
  public constructor(
    readonly expectedVersion: number | null,
    readonly currentVersion: number | null
  ) {
    super("The article translation changed after this edit began.");
    this.name = "ArticleVersionConflictError";
  }
}

export interface SavedArticleTranslation {
  readonly id: string;
  readonly postId: string;
  readonly locale: Locale;
  readonly version: number;
  readonly bodySha256: string;
  readonly rendererVersion: string;
}

/**
 * Server-only PostgreSQL article authority. Controllers must add the M6
 * authentication/authorization boundary before exposing this repository.
 */
export function createArticleStore(database: Database) {
  return {
    saveTranslation: async (
      command: SaveTranslation,
      actorId: string | null
    ): Promise<SavedArticleTranslation> => {
      const input = saveTranslationSchema.parse(command);
      const frontmatter = frontmatterSchema.parse(input.frontmatter);
      const body = normalizeBody(input.body);
      const rendered = await renderArticleBody(body);
      const bodySha256 = createHash("sha256")
        .update(body, "utf8")
        .digest("hex");

      return database.$transaction(async (prisma: any) => {
        const existing = await prisma.postTranslation.findUnique({
          where: {
            postId_locale: {
              postId: frontmatter.postId,
              locale: frontmatter.locale,
            },
          },
        });
        const currentVersion = existing?.version ?? null;
        if (currentVersion !== input.baseVersion) {
          throw new ArticleVersionConflictError(
            input.baseVersion,
            currentVersion
          );
        }

        const taxonomy = await resolveTaxonomy(prisma, frontmatter);
        await assertMedia(prisma, frontmatter);
        await prisma.post.upsert({
          where: { id: frontmatter.postId },
          update: {
            categoryId: taxonomy.categoryId,
            coverMediaId: frontmatter.coverImage,
          },
          create: {
            id: frontmatter.postId,
            authorId: actorId,
            categoryId: taxonomy.categoryId,
            coverMediaId: frontmatter.coverImage,
          },
        });
        await prisma.postTag.deleteMany({
          where: { postId: frontmatter.postId },
        });
        if (taxonomy.tagIds.length > 0) {
          await prisma.postTag.createMany({
            data: taxonomy.tagIds.map((tagId: string) => ({
              postId: frontmatter.postId,
              tagId,
            })),
          });
        }

        const data = translationData(frontmatter, body, bodySha256, rendered);
        const translation =
          existing === null
            ? await prisma.postTranslation.create({
                data: {
                  postId: frontmatter.postId,
                  locale: frontmatter.locale,
                  ...data,
                },
              })
            : await updateExisting(
                prisma,
                existing.id,
                input.baseVersion!,
                data
              );

        await prisma.contentRevision.create({
          data: {
            entityType: "PostTranslation",
            entityId: translation.id,
            entityVersion: translation.version,
            action: existing === null ? "CREATE" : "UPDATE",
            actorId,
            before: existing === null ? undefined : revisionSnapshot(existing),
            after: revisionSnapshot(translation),
          },
        });
        await prisma.auditEvent.create({
          data: {
            actorId,
            eventType: "article.translation.saved",
            targetType: "PostTranslation",
            targetId: translation.id,
            outcome: "SUCCESS",
            metadata: {
              locale: frontmatter.locale,
              version: translation.version,
            },
          },
        });

        const tags = articleCacheTags({
          locale: frontmatter.locale,
          slug: frontmatter.slug,
        });
        const event = invalidationEventSchema.parse({
          eventId: randomUUID(),
          locale: frontmatter.locale,
          reason: frontmatter.status === "published" ? "publish" : "save",
          tags,
          issuedAt: new Date().toISOString(),
        });
        await prisma.contentInvalidationOutbox.create({
          data: { cacheTag: tags[0] ?? "", payload: event },
        });
        if (actorId !== null) {
          await prisma.postDraft.deleteMany({
            where: {
              postId: frontmatter.postId,
              locale: frontmatter.locale,
              authorId: actorId,
            },
          });
        }

        return {
          id: translation.id,
          postId: translation.postId,
          locale: translation.locale,
          version: translation.version,
          bodySha256: translation.bodySha256,
          rendererVersion: translation.rendererVersion,
        };
      });
    },
  };
}

export async function enqueueDuePublications(
  database: Database,
  jobs: ContentJobStore,
  now = new Date()
): Promise<number> {
  const due = await database.postTranslation.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: now } },
    select: { id: true },
    take: 100,
  });
  let queued = 0;
  for (const { id } of due) {
    const outcome = await jobs.enqueue({
      kind: "PUBLISH_DUE",
      lockKey: `article:${id}`,
      dedupeKey: `publish:${id}`,
      payload: { translationId: id },
    });
    if (outcome === "queued") queued += 1;
  }
  return queued;
}

export async function publishDueTranslation(
  database: Database,
  translationId: string,
  now = new Date()
): Promise<"published" | "skipped"> {
  return database.$transaction(async (prisma: any) => {
    const current = await prisma.postTranslation.findUnique({
      where: { id: translationId },
    });
    if (
      current === null ||
      current.status !== "SCHEDULED" ||
      current.scheduledFor === null ||
      current.scheduledFor > now ||
      current.bodyMarkdown === null ||
      current.bodySha256 === null ||
      current.renderedHtml === null ||
      current.rendererVersion === null
    ) {
      return "skipped" as const;
    }
    const expectedDigest = createHash("sha256")
      .update(current.bodyMarkdown, "utf8")
      .digest("hex");
    if (expectedDigest !== current.bodySha256) {
      throw new Error("Scheduled article source integrity is invalid.");
    }
    const changed = await prisma.postTranslation.updateMany({
      where: {
        id: translationId,
        version: current.version,
        status: "SCHEDULED",
      },
      data: {
        status: "PUBLISHED",
        publishedAt: now,
        scheduledFor: null,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) return "skipped" as const;
    const published = await prisma.postTranslation.findUniqueOrThrow({
      where: { id: translationId },
    });
    await prisma.contentRevision.create({
      data: {
        entityType: "PostTranslation",
        entityId: translationId,
        entityVersion: published.version,
        action: "UPDATE",
        before: revisionSnapshot(current),
        after: revisionSnapshot(published),
      },
    });
    const tags = articleCacheTags({
      locale: published.locale,
      slug: published.slug,
    });
    const event = invalidationEventSchema.parse({
      eventId: randomUUID(),
      locale: published.locale,
      reason: "publish",
      tags,
      issuedAt: now.toISOString(),
    });
    await prisma.contentInvalidationOutbox.create({
      data: { cacheTag: tags[0] ?? "", payload: event },
    });
    await prisma.auditEvent.create({
      data: {
        eventType: "article.translation.published",
        targetType: "PostTranslation",
        targetId: translationId,
        outcome: "SUCCESS",
        metadata: { version: published.version },
      },
    });
    return "published" as const;
  });
}

async function updateExisting(
  prisma: any,
  id: string,
  version: number,
  data: Record<string, unknown>
) {
  const updated = await prisma.postTranslation.updateMany({
    where: { id, version },
    data: { ...data, version: { increment: 1 } },
  });
  if (updated.count !== 1) {
    const current = await prisma.postTranslation.findUnique({
      where: { id },
      select: { version: true },
    });
    throw new ArticleVersionConflictError(version, current?.version ?? null);
  }
  return prisma.postTranslation.findUniqueOrThrow({ where: { id } });
}

function translationData(
  frontmatter: Frontmatter,
  bodyMarkdown: string,
  bodySha256: string,
  rendered: Awaited<ReturnType<typeof renderArticleBody>>
) {
  return {
    title: frontmatter.title,
    slug: frontmatter.slug,
    excerpt: frontmatter.excerpt,
    seoTitle: frontmatter.seoTitle,
    seoDescription: frontmatter.seoDescription,
    canonicalUrl: frontmatter.canonicalUrl,
    socialImageId: frontmatter.socialImage,
    status: frontmatter.status.toUpperCase(),
    publishedAt:
      frontmatter.publishedAt === null
        ? null
        : new Date(frontmatter.publishedAt),
    scheduledFor:
      frontmatter.scheduledFor === null
        ? null
        : new Date(frontmatter.scheduledFor),
    bodyMarkdown,
    bodySha256,
    readingMinutes: rendered.readingTimeMinutes,
    headingTree: rendered.headings,
    renderedHtml: rendered.html,
    rendererVersion: rendered.rendererVersion,
    frontmatterSchemaVersion: frontmatter.schemaVersion,
    archivedAt: frontmatter.status === "archived" ? new Date() : null,
  };
}

function normalizeBody(body: string): string {
  return body
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

async function resolveTaxonomy(prisma: any, frontmatter: Frontmatter) {
  const category =
    frontmatter.category === null
      ? null
      : await prisma.category.findUnique({
          where: { key: frontmatter.category },
          select: { id: true, enabled: true },
        });
  if (frontmatter.category !== null && category?.enabled !== true) {
    throw new Error(`Unknown or disabled category: ${frontmatter.category}`);
  }
  const tags = await prisma.tag.findMany({
    where: { key: { in: frontmatter.tags }, enabled: true },
    select: { id: true, key: true },
  });
  if (tags.length !== frontmatter.tags.length) {
    const found = new Set(tags.map((tag: any) => tag.key));
    const missing = frontmatter.tags.filter((key) => !found.has(key));
    throw new Error(`Unknown or disabled tags: ${missing.join(", ")}`);
  }
  return {
    categoryId: category?.id ?? null,
    tagIds: tags.map((tag: any) => tag.id),
  };
}

async function assertMedia(prisma: any, frontmatter: Frontmatter) {
  const ids = [frontmatter.coverImage, frontmatter.socialImage].filter(
    (id) => id !== null
  );
  if (ids.length === 0) return;
  const count = await prisma.mediaAsset.count({
    where: { id: { in: [...new Set(ids)] }, status: "READY", archivedAt: null },
  });
  if (count !== new Set(ids).size)
    throw new Error("Referenced media is missing or unavailable.");
}

function revisionSnapshot(value: any) {
  return {
    postId: value.postId,
    locale: value.locale,
    title: value.title,
    slug: value.slug,
    excerpt: value.excerpt,
    status: value.status,
    bodyMarkdown: value.bodyMarkdown,
    bodySha256: value.bodySha256,
    renderedHtml: value.renderedHtml,
    rendererVersion: value.rendererVersion,
    version: value.version,
  };
}

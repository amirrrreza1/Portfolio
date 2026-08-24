import { parseContentPath } from "@portfolio/contracts";
import type { ContentIndexStore } from "@portfolio/content-store";
import {
  articleCacheTags,
  type InvalidationEvent,
} from "@portfolio/contracts/content";
import { randomUUID } from "node:crypto";

import type { Database } from "./client.js";

/** Prisma transaction adapter for M3's Git-to-index apply boundary. */
export function createContentIndexStore(database: Database): ContentIndexStore {
  return {
    apply: async (input) => {
      try {
        return await database.$transaction(async (prisma: any) => {
          const existing = await prisma.contentApplyLedger.findUnique({
            where: {
              commitSha_path: { commitSha: input.commitSha, path: input.path },
            },
          });
          if (existing) return "already-applied" as const;

          const taxonomy = await resolveTaxonomy(prisma, input.frontmatter);
          await assertMediaReferences(prisma, input.frontmatter);

          // A direct push is a supported authoring path, so the first valid
          // translation must be able to establish its parent Post. Requiring
          // an admin-created shell would turn a repository-first workflow into
          // an order-dependent, split-brain one.
          await prisma.post.upsert({
            where: { id: input.postId },
            update: {
              categoryId: taxonomy.categoryId,
              coverMediaId: input.frontmatter.coverImage,
            },
            create: {
              id: input.postId,
              categoryId: taxonomy.categoryId,
              coverMediaId: input.frontmatter.coverImage,
            },
          });
          await prisma.postTag.deleteMany({ where: { postId: input.postId } });
          if (taxonomy.tagIds.length > 0) {
            await prisma.postTag.createMany({
              data: taxonomy.tagIds.map((tagId) => ({
                postId: input.postId,
                tagId,
              })),
            });
          }

          await prisma.postTranslation.upsert({
            where: {
              postId_locale: { postId: input.postId, locale: input.locale },
            },
            update: translationData(input),
            create: {
              postId: input.postId,
              locale: input.locale,
              ...translationData(input),
            },
          });
          await prisma.contentApplyLedger.create({
            data: {
              commitSha: input.commitSha,
              path: input.path,
              blobSha: input.blobSha,
            },
          });
          // Written inside the apply transaction, so a commit that succeeds and
          // an invalidation that never sends is a stale page rather than a lost
          // publish (ADR-012). The tags are built from the shared contract, not
          // spelled here: they are a wire agreement with a process this code
          // never calls, and a mismatched string is an invalidation that
          // silently does nothing.
          const tags = articleCacheTags({
            locale: input.locale,
            slug: input.slug,
          });
          const event: InvalidationEvent = {
            eventId: randomUUID(),
            locale: input.locale,
            reason: "sync",
            tags: [...tags],
            issuedAt: new Date().toISOString(),
          };
          await prisma.contentInvalidationOutbox.create({
            data: {
              // The primary tag, for operator triage. The full set travels in
              // the payload, because one apply can affect several tags and
              // splitting them into rows would let a page be purged while its
              // listing was not.
              cacheTag: tags[0] ?? "",
              payload: event,
            },
          });
          await prisma.contentSyncLog.create({
            data: {
              commitSha: input.commitSha,
              trigger: "RECONCILE",
              affectedPaths: [input.path],
              outcome: "SUCCESS",
              finishedAt: new Date(),
            },
          });
          return "applied" as const;
        });
      } catch (error: any) {
        if (error?.code === "P2002") return "already-applied";
        throw error;
      }
    },
    recordFailure: async (input) => {
      const contentPath = parseContentPath(input.path);
      const locale =
        contentPath?.locale === "en" || contentPath?.locale === "fa"
          ? contentPath.locale
          : null;
      if (contentPath && locale) {
        await database.postTranslation.updateMany({
          where: {
            postId: contentPath.postId,
            locale,
          },
          data: {
            syncState: "SYNC_FAILED",
            syncError: input.reason,
          },
        });
      }
      await database.contentSyncLog.create({
        data: {
          commitSha: input.commitSha,
          trigger: "RECONCILE",
          affectedPaths: [input.path],
          outcome: "FAILURE",
          errorSummary: input.reason,
          finishedAt: new Date(),
        },
      });
    },
    markMissing: async (input) => {
      const present = new Set(input.presentPaths);
      const candidates = await database.postTranslation.findMany({
        where: {
          sourceBlobSha: { not: null },
          syncState: { not: "MISSING_IN_GIT" },
        },
        select: { postId: true, locale: true },
      });
      const missing = candidates.filter(
        ({ postId, locale }) =>
          !present.has(`content/blog/${postId}/${locale}.md`)
      );
      if (missing.length === 0) return 0;

      await database.$transaction(async (prisma: any) => {
        for (const translation of missing) {
          const path = `content/blog/${translation.postId}/${translation.locale}.md`;
          await prisma.postTranslation.updateMany({
            where: {
              postId: translation.postId,
              locale: translation.locale,
            },
            data: {
              syncState: "MISSING_IN_GIT",
              syncError:
                "Content file is missing from the reconciled Git tree.",
            },
          });
          await prisma.contentSyncLog.create({
            data: {
              commitSha: input.commitSha,
              trigger: "RECONCILE",
              affectedPaths: [path],
              outcome: "PARTIAL",
              errorSummary:
                "Content file is missing from the reconciled Git tree.",
              finishedAt: new Date(),
            },
          });
        }
      });
      return missing.length;
    },
  };
}

function translationData(input: Parameters<ContentIndexStore["apply"]>[0]) {
  return {
    title: input.title,
    slug: input.slug,
    excerpt: input.frontmatter.excerpt,
    seoTitle: input.frontmatter.seoTitle,
    seoDescription: input.frontmatter.seoDescription,
    canonicalUrl: input.frontmatter.canonicalUrl,
    socialImageId: input.frontmatter.socialImage,
    status: input.status.toUpperCase(),
    publishedAt: dateOrNull(input.frontmatter.publishedAt),
    scheduledFor: dateOrNull(input.frontmatter.scheduledFor),
    renderedHtml: input.renderedHtml,
    rendererVersion: input.rendererVersion,
    readingMinutes: input.readingMinutes,
    headingTree: input.headings,
    sourceBlobSha: input.blobSha,
    syncState: "SYNCED",
    syncError: null,
    lastSyncedAt: new Date(),
    frontmatterSchemaVersion: 1,
  };
}

async function resolveTaxonomy(
  prisma: any,
  frontmatter: Parameters<ContentIndexStore["apply"]>[0]["frontmatter"]
): Promise<{ readonly categoryId: string | null; readonly tagIds: string[] }> {
  const category = frontmatter.category
    ? await prisma.category.findUnique({ where: { key: frontmatter.category } })
    : null;
  if (frontmatter.category && !category) {
    throw new Error(`Unknown content category: ${frontmatter.category}.`);
  }

  const tags = await prisma.tag.findMany({
    where: { key: { in: [...frontmatter.tags] } },
    select: { id: true, key: true },
  });
  if (tags.length !== frontmatter.tags.length) {
    const found = new Set(tags.map((tag: { key: string }) => tag.key));
    const missing = frontmatter.tags.find((tag) => !found.has(tag));
    throw new Error(`Unknown content tag: ${missing ?? "unknown"}.`);
  }
  return {
    categoryId: category?.id ?? null,
    tagIds: tags.map((tag: { id: string }) => tag.id),
  };
}

async function assertMediaReferences(
  prisma: any,
  frontmatter: Parameters<ContentIndexStore["apply"]>[0]["frontmatter"]
): Promise<void> {
  for (const id of [frontmatter.coverImage, frontmatter.socialImage]) {
    if (!id) continue;
    const media = await prisma.mediaAsset.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!media) throw new Error(`Unknown content media asset: ${id}.`);
  }
}

function dateOrNull(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

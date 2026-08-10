import type { ContentIndexStore } from "@portfolio/content-store";

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
          await prisma.contentInvalidationOutbox.create({
            data: {
              cacheTag: "post:" + input.postId + ":" + input.locale,
              payload: { postId: input.postId, locale: input.locale },
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
  };
}

function translationData(input: Parameters<ContentIndexStore["apply"]>[0]) {
  return {
    title: input.title,
    slug: input.slug,
    status: input.status.toUpperCase(),
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

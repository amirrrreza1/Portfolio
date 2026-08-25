import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  ArticleVersionConflictError,
  createArticleStore,
  publishDueTranslation,
} from "../src/articles.js";
import type { Database } from "../src/client.js";

const postId = "clx8k2p9q0000abcd1234efg";
const body = "## Introduction\n\nSafe **Markdown**.";
const frontmatter = {
  schemaVersion: 1 as const,
  postId,
  locale: "en" as const,
  title: "Database-native articles",
  slug: "database-native-articles",
  excerpt: "One PostgreSQL authority.",
  status: "draft" as const,
};

function transactionDatabase(prisma: Record<string, unknown>): Database {
  return {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
  } as unknown as Database;
}

describe("createArticleStore", () => {
  it("atomically prepares source, safe render, revision, audit, and invalidation", async () => {
    const translationCreate = vi.fn().mockImplementation(({ data }) => ({
      id: "translation-1",
      version: 0,
      ...data,
    }));
    const revisionCreate = vi.fn();
    const outboxCreate = vi.fn();
    const prisma = {
      postTranslation: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: translationCreate,
      },
      category: { findUnique: vi.fn() },
      tag: { findMany: vi.fn().mockResolvedValue([]) },
      mediaAsset: { count: vi.fn() },
      post: { upsert: vi.fn() },
      postTag: { deleteMany: vi.fn(), createMany: vi.fn() },
      contentRevision: { create: revisionCreate },
      auditEvent: { create: vi.fn() },
      contentInvalidationOutbox: { create: outboxCreate },
      postDraft: { deleteMany: vi.fn() },
    };
    const saved = await createArticleStore(
      transactionDatabase(prisma)
    ).saveTranslation({ frontmatter, body, baseVersion: null }, "owner-1");

    const normalized = body.trim();
    expect(saved.bodySha256).toBe(
      createHash("sha256").update(normalized).digest("hex")
    );
    expect(translationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bodyMarkdown: normalized,
        bodySha256: saved.bodySha256,
        renderedHtml: expect.stringContaining("<strong>Markdown</strong>"),
        rendererVersion: saved.rendererVersion,
      }),
    });
    expect(revisionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "PostTranslation",
        entityVersion: 0,
        action: "CREATE",
      }),
    });
    expect(outboxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cacheTag: "public:article:database-native-articles:en",
        payload: expect.objectContaining({ reason: "save", locale: "en" }),
      }),
    });
  });

  it("rejects a stale integer version before mutating related state", async () => {
    const postUpsert = vi.fn();
    const prisma = {
      postTranslation: {
        findUnique: vi.fn().mockResolvedValue({
          id: "translation-1",
          version: 4,
        }),
      },
      post: { upsert: postUpsert },
    };

    await expect(
      createArticleStore(transactionDatabase(prisma)).saveTranslation(
        { frontmatter, body, baseVersion: 3 },
        "owner-1"
      )
    ).rejects.toEqual(new ArticleVersionConflictError(3, 4));
    expect(postUpsert).not.toHaveBeenCalled();
  });
});

describe("publishDueTranslation", () => {
  it("skips stale or already-processed publication work idempotently", async () => {
    const updateMany = vi.fn();
    const result = await publishDueTranslation(
      transactionDatabase({
        postTranslation: {
          findUnique: vi.fn().mockResolvedValue({
            id: "translation-1",
            status: "PUBLISHED",
          }),
          updateMany,
        },
      }),
      "translation-1"
    );
    expect(result).toBe("skipped");
    expect(updateMany).not.toHaveBeenCalled();
  });
});

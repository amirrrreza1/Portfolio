import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  ArticleVersionConflictError,
  createArticleStore,
  enqueueDuePublications,
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

  it("accepts only media a public page may actually deliver", async () => {
    const count = vi.fn().mockResolvedValue(0);
    const prisma = {
      postTranslation: { findUnique: vi.fn().mockResolvedValue(null) },
      category: { findUnique: vi.fn() },
      tag: { findMany: vi.fn().mockResolvedValue([]) },
      mediaAsset: { count },
      post: { upsert: vi.fn() },
    };

    await expect(
      createArticleStore(transactionDatabase(prisma)).saveTranslation(
        {
          frontmatter: {
            ...frontmatter,
            coverImage: "clx8k2p9q0000abcd1234cov",
            coverImageAlt: "A cover image.",
          },
          body,
          baseVersion: null,
        },
        "owner-1"
      )
    ).rejects.toThrow(/media is missing or unavailable/);

    // The predicate must be the one the public read paths use. A save that
    // only checks existence lets a quarantined or private asset become a
    // broken or leaking image on a published article — and no unit test that
    // mocks the count away can see that, which is how it shipped once.
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        kind: "IMAGE",
        processingState: "VERIFIED",
        visibility: "PUBLIC",
        archivedAt: null,
      }),
    });
  });

  it("writes nothing outside the single transaction it opens", async () => {
    const outside = vi.fn();
    const prisma = {
      postTranslation: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => ({
          id: "translation-1",
          version: 0,
          ...data,
        })),
      },
      category: { findUnique: vi.fn() },
      tag: { findMany: vi.fn().mockResolvedValue([]) },
      mediaAsset: { count: vi.fn() },
      post: { upsert: vi.fn() },
      postTag: { deleteMany: vi.fn(), createMany: vi.fn() },
      contentRevision: { create: vi.fn() },
      auditEvent: { create: vi.fn() },
      contentInvalidationOutbox: { create: vi.fn() },
      postDraft: { deleteMany: vi.fn() },
    };
    let opened = 0;
    const database = {
      $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
        opened += 1;
        return run(prisma);
      },
      // Any write reaching the base client instead of the transaction client
      // would survive a rollback, which is the one thing this store promises
      // cannot happen.
      postTranslation: { create: outside, updateMany: outside },
      contentRevision: { create: outside },
      contentInvalidationOutbox: { create: outside },
    } as unknown as Database;

    await createArticleStore(database).saveTranslation(
      { frontmatter, body, baseVersion: null },
      "owner-1"
    );

    expect(opened).toBe(1);
    expect(outside).not.toHaveBeenCalled();
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

  it("refuses to publish a body whose digest no longer matches its source", async () => {
    const updateMany = vi.fn();
    await expect(
      publishDueTranslation(
        transactionDatabase({
          postTranslation: {
            findUnique: vi.fn().mockResolvedValue({
              id: "translation-1",
              status: "SCHEDULED",
              scheduledFor: new Date("2026-01-01T00:00:00.000Z"),
              bodyMarkdown: "# real source",
              bodySha256: "0".repeat(64),
              renderedHtml: "<h1>real source</h1>",
              rendererVersion: "2",
              version: 2,
            }),
            updateMany,
          },
        }),
        "translation-1",
        new Date("2026-06-01T00:00:00.000Z")
      )
    ).rejects.toThrow(/source integrity/);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("leaves a translation alone until its scheduled time arrives", async () => {
    const updateMany = vi.fn();
    const source = "# not yet";
    const result = await publishDueTranslation(
      transactionDatabase({
        postTranslation: {
          findUnique: vi.fn().mockResolvedValue({
            id: "translation-1",
            status: "SCHEDULED",
            scheduledFor: new Date("2026-12-01T00:00:00.000Z"),
            bodyMarkdown: source,
            bodySha256: createHash("sha256").update(source).digest("hex"),
            renderedHtml: "<h1>not yet</h1>",
            rendererVersion: "2",
            version: 0,
          }),
          updateMany,
        },
      }),
      "translation-1",
      new Date("2026-06-01T00:00:00.000Z")
    );
    expect(result).toBe("skipped");
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("enqueueDuePublications", () => {
  it("reports newly queued work only, so a repeated tick is not progress", async () => {
    const database = {
      postTranslation: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]),
      },
    } as unknown as Database;
    const enqueue = vi
      .fn()
      .mockResolvedValueOnce("queued")
      .mockResolvedValueOnce("deduplicated")
      .mockResolvedValueOnce("queued");

    const queued = await enqueueDuePublications(database, { enqueue } as never);

    expect(queued).toBe(2);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "PUBLISH_DUE",
        lockKey: "article:a",
        dedupeKey: "publish:a",
      })
    );
  });
});

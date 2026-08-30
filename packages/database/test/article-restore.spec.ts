import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  ArticleRestoreRefusedError,
  restoreArticleRevision,
} from "../src/article-restore.js";
import type { Database } from "../src/client.js";

const postId = "clx8k2p9q0000abcd1234efg";
const translationId = "clx8k2p9q0000abcd1234eft";
const historicBody =
  "## The first version\n\nProse as it was **first** written.";
const currentBody = "## The current version\n\nProse as it stands today.";

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    postId,
    locale: "en",
    title: "The first title",
    slug: "the-first-title",
    excerpt: "The excerpt as it was.",
    seoTitle: null,
    seoDescription: null,
    canonicalUrl: null,
    socialImageId: null,
    frontmatterSchemaVersion: 1,
    status: "DRAFT",
    bodyMarkdown: historicBody,
    bodySha256: createHash("sha256").update(historicBody, "utf8").digest("hex"),
    renderedHtml: "<h2>stale render from an older renderer</h2>",
    rendererVersion: "0",
    version: 1,
    ...overrides,
  };
}

function currentTranslation(overrides: Record<string, unknown> = {}) {
  return {
    id: translationId,
    postId,
    locale: "en",
    title: "The current title",
    slug: "the-current-title",
    excerpt: "The excerpt as it stands.",
    seoTitle: null,
    seoDescription: null,
    canonicalUrl: null,
    socialImageId: null,
    frontmatterSchemaVersion: 1,
    status: "PUBLISHED",
    publishedAt: new Date("2026-08-01T10:00:00.000Z"),
    scheduledFor: null,
    archivedAt: null,
    bodyMarkdown: currentBody,
    bodySha256: createHash("sha256").update(currentBody, "utf8").digest("hex"),
    version: 7,
    post: { category: null, tags: [], coverMedia: null },
    ...overrides,
  };
}

function fixture(
  options: {
    readonly after?: unknown;
    readonly current?: Record<string, unknown>;
  } = {}
) {
  const revisions: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const outbox: Record<string, unknown>[] = [];
  const redirects: Record<string, unknown>[] = [];
  let stored = options.current ?? currentTranslation();
  const tx = {
    postTranslation: {
      findUnique: vi.fn(async () => stored),
      updateMany: vi.fn(async ({ data }: any) => {
        stored = {
          ...stored,
          ...data,
          version: (stored.version as number) + 1,
        };
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async () => stored),
    },
    category: { findUnique: vi.fn() },
    tag: { findMany: vi.fn(async () => []) },
    mediaAsset: { count: vi.fn(async () => 0) },
    post: { upsert: vi.fn() },
    postTag: { deleteMany: vi.fn(), createMany: vi.fn() },
    contentRevision: {
      create: vi.fn(async ({ data }: any) => void revisions.push(data)),
    },
    auditEvent: {
      create: vi.fn(async ({ data }: any) => void audits.push(data)),
    },
    contentInvalidationOutbox: {
      create: vi.fn(async ({ data }: any) => void outbox.push(data)),
    },
    postDraft: { deleteMany: vi.fn() },
    slugRedirect: {
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(async ({ create }: any) => void redirects.push(create)),
    },
  };
  const database = {
    contentRevision: {
      findUnique: vi.fn(async () => ({
        id: "revision-1",
        entityType: "PostTranslation",
        entityId: translationId,
        entityVersion: 1,
        after: options.after === undefined ? snapshot() : options.after,
      })),
    },
    postTranslation: { findUnique: vi.fn(async () => stored) },
    $transaction: async (run: (client: unknown) => Promise<unknown>) => run(tx),
  } as unknown as Database;
  return {
    database,
    tx,
    revisions,
    audits,
    outbox,
    redirects,
    get stored() {
      return stored;
    },
  };
}

describe("restoreArticleRevision", () => {
  it("replays the recorded source through the validated save path", async () => {
    const world = fixture();

    const restored = await restoreArticleRevision(world.database, {
      revisionId: "revision-1",
      actorId: "owner-1",
    });

    expect(restored.restoredFromRevisionId).toBe("revision-1");
    expect(restored.bodySha256).toBe(
      createHash("sha256").update(historicBody, "utf8").digest("hex")
    );
    // The render is produced now, never copied out of the snapshot.
    expect(world.stored.renderedHtml).toContain("The first version");
    expect(world.stored.renderedHtml).not.toContain("stale render");
    expect(world.stored.rendererVersion).not.toBe("0");
    expect(world.revisions.at(-1)).toMatchObject({ action: "RESTORE" });
    expect(world.audits.at(-1)).toMatchObject({
      eventType: "article.translation.restored",
      metadata: expect.objectContaining({
        restoredFromRevisionId: "revision-1",
        restoredFromVersion: 1,
      }),
    });
    expect(world.outbox).toHaveLength(1);
  });

  it("keeps today's lifecycle rather than the snapshot's", async () => {
    const world = fixture({ after: snapshot({ status: "DRAFT" }) });

    await restoreArticleRevision(world.database, {
      revisionId: "revision-1",
      actorId: "owner-1",
    });

    expect(world.stored.status).toBe("PUBLISHED");
    expect((world.stored.publishedAt as Date).toISOString()).toBe(
      "2026-08-01T10:00:00.000Z"
    );
    expect(world.outbox.at(0)).toMatchObject({
      payload: expect.objectContaining({ reason: "publish" }),
    });
  });

  it("writes a redirect when the restored slug moves the article back", async () => {
    const world = fixture();

    await restoreArticleRevision(world.database, {
      revisionId: "revision-1",
      actorId: "owner-1",
    });

    expect(world.redirects.at(0)).toMatchObject({
      fromPath: "/en/blog/the-current-title",
      toPath: "/en/blog/the-first-title",
      statusCode: 308,
    });
  });

  /**
   * The live run's defect, pinned.
   *
   * Restoring is how an article moves *back* to a path it already redirects
   * away from, and collapsing chains before clearing that rule rewrote the
   * old rule into `/a -> /a`, which the `slug_redirects_no_self_target` check
   * constraint refuses. Order is the fix, so order is what this asserts.
   */
  it("clears the destination's own rule before collapsing chains onto it", async () => {
    const world = fixture();
    const order: string[] = [];
    world.tx.slugRedirect.deleteMany = vi.fn(
      async () => void order.push("delete")
    );
    world.tx.slugRedirect.updateMany = vi.fn(
      async () => void order.push("collapse")
    );

    await restoreArticleRevision(world.database, {
      revisionId: "revision-1",
      actorId: "owner-1",
    });

    expect(order).toEqual(["delete", "collapse"]);
    expect(world.tx.slugRedirect.deleteMany).toHaveBeenCalledWith({
      where: { locale: "en", fromPath: "/en/blog/the-first-title" },
    });
    expect(world.tx.slugRedirect.updateMany).toHaveBeenCalledWith({
      where: {
        locale: "en",
        toPath: "/en/blog/the-current-title",
        fromPath: { not: "/en/blog/the-first-title" },
      },
      data: { toPath: "/en/blog/the-first-title" },
    });
  });

  it("refuses a snapshot whose source no longer matches its digest", async () => {
    const world = fixture({
      after: snapshot({ bodyMarkdown: `${historicBody}\n\nTampered.` }),
    });

    await expect(
      restoreArticleRevision(world.database, {
        revisionId: "revision-1",
        actorId: "owner-1",
      })
    ).rejects.toBeInstanceOf(ArticleRestoreRefusedError);
    expect(world.tx.postTranslation.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to write into an archived translation", async () => {
    const world = fixture({
      current: currentTranslation({
        status: "ARCHIVED",
        publishedAt: null,
        archivedAt: new Date("2026-08-20T00:00:00.000Z"),
      }),
    });

    await expect(
      restoreArticleRevision(world.database, {
        revisionId: "revision-1",
        actorId: "owner-1",
      })
    ).rejects.toMatchObject({ code: "WRONG_STATE" });
    expect(world.tx.postTranslation.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a revision that does not describe an article", async () => {
    const world = fixture();
    (world.database.contentRevision.findUnique as any) = vi.fn(async () => ({
      id: "revision-2",
      entityType: "Project",
      entityId: "project-1",
      entityVersion: 3,
      after: {},
    }));

    await expect(
      restoreArticleRevision(world.database, {
        revisionId: "revision-2",
        actorId: "owner-1",
      })
    ).rejects.toMatchObject({ code: "NOT_AN_ARTICLE" });
  });
});

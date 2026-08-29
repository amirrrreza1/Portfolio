import { describe, expect, it, vi } from "vitest";

import {
  ArticleImportReportError,
  BlogAdminService,
} from "../src/modules/blog/blog.service.js";

const POST_ID = "clx8k2p9q0000abcd1234efg";
const ACTOR_ID = "clx8k2p9q0000abcd1234efa";
const source = `---
schemaVersion: 1
postId: ${POST_ID}
locale: en
title: Imported safely
slug: imported-safely
status: draft
excerpt: A reviewed import.
---
## A section

The normalized body.
`;

function fixture() {
  let importRow: Record<string, any> | null = null;
  const mediaCreates: Record<string, any>[] = [];
  const objectWrites: Array<{ key: string; bytes: Uint8Array }> = [];
  const tx = {
    mediaAsset: {
      create: vi.fn(async ({ data }) => {
        mediaCreates.push(data);
        return data;
      }),
    },
    articleImportReport: {
      create: vi.fn(async ({ data }) => {
        importRow = {
          id: "clx8k2p9q0000abcd1234efr",
          committedAt: null,
          createdAt: new Date("2026-08-29T00:00:00Z"),
          ...data,
        };
        return importRow;
      }),
    },
    auditEvent: { create: vi.fn(async () => undefined) },
  };
  const database = {
    postTranslation: { findUnique: vi.fn(async () => null) },
    articleImportReport: {
      findUnique: vi.fn(async () => importRow),
      updateMany: vi.fn(async ({ data }) => {
        if (importRow === null || importRow.committedAt !== null) {
          return { count: 0 };
        }
        importRow = { ...importRow, ...data };
        return { count: 1 };
      }),
    },
    $transaction: vi.fn(async (run) => run(tx)),
  };
  const mediaStore = {
    put: vi.fn(async (key: string, bytes: Uint8Array) => {
      objectWrites.push({ key, bytes });
    }),
    remove: vi.fn(async () => undefined),
  };
  const service = new BlogAdminService(
    database as never,
    null,
    10 * 60 * 1000,
    mediaStore
  );
  return {
    database,
    mediaCreates,
    mediaStore,
    objectWrites,
    service,
    row: () => importRow,
  };
}

describe("BlogAdminService article import", () => {
  it("binds a dry-run token to a private byte-for-byte quarantined source", async () => {
    const { service, row, mediaCreates, objectWrites } = fixture();
    const bytes = new TextEncoder().encode(source);
    const report = await service.prepareImport(
      ACTOR_ID,
      { postId: POST_ID, locale: "en", confirm: false, reportToken: null },
      { filename: "article.md", bytes },
      new Date("2026-08-29T00:00:00Z")
    );

    expect(report.accepted).toBe(true);
    expect(report.normalizedDocument).toContain("publishedAt: null");
    expect(report.diff).toContain("+++ import.md");
    expect(row()?.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(row()?.tokenHash).not.toBe(report.reportToken);
    expect(mediaCreates[0]).toMatchObject({
      id: report.quarantinedSourceId,
      kind: "DOCUMENT",
      processingState: "QUARANTINED",
      visibility: "PRIVATE",
    });
    expect(Buffer.from(objectWrites[0]?.bytes ?? [])).toEqual(
      Buffer.from(bytes)
    );
  });

  it("confirms the reviewed normalization once through the article save path", async () => {
    const { service } = fixture();
    const report = await service.prepareImport(
      ACTOR_ID,
      { postId: POST_ID, locale: "en", confirm: false, reportToken: null },
      { filename: "article.md", bytes: new TextEncoder().encode(source) },
      new Date("2026-08-29T00:00:00Z")
    );
    const saveTranslation = vi.fn(async () => ({
      id: "clx8k2p9q0000abcd1234eft",
      postId: POST_ID,
      locale: "en",
      version: 0,
    }));
    (
      service as unknown as {
        articles: { saveTranslation: typeof saveTranslation };
      }
    ).articles = {
      saveTranslation,
    };

    await expect(
      service.confirmImport(
        ACTOR_ID,
        {
          postId: POST_ID,
          locale: "en",
          confirm: true,
          reportToken: report.reportToken,
        },
        new Date("2026-08-29T00:01:00Z")
      )
    ).resolves.toMatchObject({
      postId: POST_ID,
      quarantinedSourceId: report.quarantinedSourceId,
    });
    expect(saveTranslation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "## A section\n\nThe normalized body.\n",
        baseVersion: null,
      }),
      ACTOR_ID
    );

    await expect(
      service.confirmImport(
        ACTOR_ID,
        {
          postId: POST_ID,
          locale: "en",
          confirm: true,
          reportToken: report.reportToken,
        },
        new Date("2026-08-29T00:02:00Z")
      )
    ).rejects.toMatchObject<ArticleImportReportError>({
      reason: "REPORT_USED",
    });
  });

  it("does not let a different actor redeem the bearer token", async () => {
    const { service } = fixture();
    const report = await service.prepareImport(
      ACTOR_ID,
      { postId: POST_ID, locale: "en", confirm: false, reportToken: null },
      { filename: "article.md", bytes: new TextEncoder().encode(source) }
    );

    await expect(
      service.confirmImport("clx8k2p9q0000abcd1234efb", {
        postId: POST_ID,
        locale: "en",
        confirm: true,
        reportToken: report.reportToken,
      })
    ).rejects.toMatchObject<ArticleImportReportError>({
      reason: "REPORT_NOT_FOUND",
    });
  });

  it("does not let imported frontmatter bypass the publish lifecycle", async () => {
    const { service } = fixture();
    const publishedSource = source.replace(
      "status: draft",
      "status: published\npublishedAt: 2026-08-29T00:00:00.000Z"
    );
    const report = await service.prepareImport(
      ACTOR_ID,
      { postId: POST_ID, locale: "en", confirm: false, reportToken: null },
      {
        filename: "published.md",
        bytes: new TextEncoder().encode(publishedSource),
      }
    );

    expect(report.accepted).toBe(true);
    expect(report.normalizedFrontmatter?.status).toBe("draft");
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "LIFECYCLE_STATE_PRESERVED",
      })
    );
  });
});

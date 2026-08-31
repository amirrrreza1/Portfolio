import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  MarkdownValidationError,
  parseArticle,
  serializeArticle,
} from "@portfolio/markdown";

import { BlogAdminService } from "../src/modules/blog/blog.service.js";

const POST_ID = "clx8k2p9q0000abcd1234efg";
const BODY =
  '## Saved source\n\n:::callout{type="info"}\nPortable prose.\n:::\n';

function fixture(overrides: Record<string, unknown> = {}) {
  const row = {
    postId: POST_ID,
    locale: "en",
    title: "A saved article",
    slug: "a-saved-article",
    excerpt: "An exportable article.",
    status: "PUBLISHED",
    publishedAt: new Date("2026-08-29T00:00:00Z"),
    scheduledFor: null,
    updatedAt: new Date("2026-08-31T00:00:00Z"),
    frontmatterSchemaVersion: 1,
    seoTitle: "Saved SEO title",
    seoDescription: "Saved SEO description.",
    canonicalUrl: "https://example.com/en/blog/a-saved-article",
    socialImageId: null,
    bodyMarkdown: BODY,
    bodySha256: createHash("sha256").update(BODY).digest("hex"),
    post: {
      category: { key: "engineering" },
      tags: [{ tag: { key: "zeta" } }, { tag: { key: "alpha" } }],
      coverMedia: {
        id: "clx8k2p9q0000abcd1234efm",
        altText: "Cover illustration",
      },
    },
    ...overrides,
  };
  const database = {
    postTranslation: { findUnique: vi.fn(async () => row) },
    postDraft: { findUnique: vi.fn() },
  };
  return { row, database, service: new BlogAdminService(database as never) };
}

describe("saved article Markdown export", () => {
  it("round-trips committed metadata and body with byte-stable taxonomy order", async () => {
    const { service, database, row } = fixture();
    const first = await service.exportTranslation(POST_ID, "en");
    expect(first?.filename).toBe(`${POST_ID}.en.md`);
    const parsed = parseArticle(first!.document);
    expect(parsed.body).toBe(BODY);
    expect(parsed.frontmatter).toMatchObject({
      postId: POST_ID,
      locale: "en",
      title: row.title,
      status: "published",
      publishedAt: "2026-08-29T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
      category: "engineering",
      tags: ["alpha", "zeta"],
      coverImage: "clx8k2p9q0000abcd1234efm",
      coverImageAlt: "Cover illustration",
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      canonicalUrl: row.canonicalUrl,
    });
    expect(serializeArticle(parsed)).toBe(first!.document);
    row.post.tags.reverse();
    expect(await service.exportTranslation(POST_ID, "en")).toEqual(first);
    expect(database.postDraft.findUnique).not.toHaveBeenCalled();
  });

  it("preserves Persian Unicode source and the exact locale", async () => {
    const body = "## عنوان\n\nمتن مقاله فارسی.\n";
    const { service, database } = fixture({
      locale: "fa",
      title: "مقاله فارسی",
      slug: "مقاله-فارسی",
      bodyMarkdown: body,
      bodySha256: createHash("sha256").update(body).digest("hex"),
    });
    const result = await service.exportTranslation(POST_ID, "fa");
    expect(result?.filename).toBe(`${POST_ID}.fa.md`);
    expect(parseArticle(result!.document).body).toBe(body);
    expect(database.postTranslation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId_locale: { postId: POST_ID, locale: "fa" } },
      })
    );
  });

  it("returns missing rather than falling back to another translation", async () => {
    const { service, database } = fixture();
    database.postTranslation.findUnique.mockResolvedValue(null as never);
    expect(await service.exportTranslation(POST_ID, "fa")).toBeNull();
  });

  it.each(["SCHEDULED", "ARCHIVED"])(
    "exports %s without a publication transition",
    async (status) => {
      const { service } = fixture({
        status,
        publishedAt: null,
        scheduledFor:
          status === "SCHEDULED" ? new Date("2026-09-01T00:00:00Z") : null,
      });
      const result = await service.exportTranslation(POST_ID, "en");
      expect(parseArticle(result!.document).frontmatter.status).toBe(
        status.toLowerCase()
      );
    }
  );

  it.each([
    { bodyMarkdown: null },
    { bodySha256: null },
    { bodySha256: "f".repeat(64) },
    {
      bodyMarkdown: "",
      bodySha256: createHash("sha256").update("").digest("hex"),
    },
  ])("refuses missing, corrupt, or empty source: %j", async (invalid) => {
    const { service } = fixture(invalid);
    await expect(
      service.exportTranslation(POST_ID, "en")
    ).rejects.toBeInstanceOf(MarkdownValidationError);
  });
});

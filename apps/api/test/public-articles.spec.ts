import type { Database } from "@portfolio/database";
import {
  publicArticleDetailEnvelopeSchema,
  publicArticleDetailSchema,
  publicArticleListEnvelopeSchema,
  publicArticleListSchema,
  publicArticleTranslationNotFoundSchema,
} from "@portfolio/contracts/blog";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

import { AppModule } from "../src/app.module.js";
import { withStubbedAuth } from "./support/auth-overrides.js";
import { configureApplication } from "../src/configure-app.js";
import { CONTACT_SUBMISSION_SERVICE } from "../src/modules/contact/contact.controller.js";
import { PUBLIC_APPEARANCE_SERVICE } from "../src/modules/public/public-appearance.controller.js";
import { PUBLIC_ARTICLES_SERVICE } from "../src/modules/public/public-articles.controller.js";
import { PublicArticlesService } from "../src/modules/public/public-articles.service.js";
import { PUBLIC_HOME_SERVICE } from "../src/modules/public/public-home.controller.js";
import { PUBLIC_PROJECTS_SERVICE } from "../src/modules/public/public-projects.controller.js";
import { PUBLIC_SITE_SERVICE } from "../src/modules/public/public-site.controller.js";

const postId = "p12345678901234567890123";
const translationId = "t12345678901234567890123";
const secondTranslationId = "u12345678901234567890123";
const publishedAt = new Date("2026-08-14T12:00:00.000Z");
const updatedAt = new Date("2026-08-14T13:00:00.000Z");
const bodyMarkdown = "## Introduction\n\nSafe body.";
const bodySha256 = createHash("sha256")
  .update(bodyMarkdown, "utf8")
  .digest("hex");

const summary = {
  id: postId,
  slug: "typed-public-reads",
  title: "Typed public reads",
  excerpt: "A strict published summary.",
  publishedAt: publishedAt.toISOString(),
  updatedAt: updatedAt.toISOString(),
  readingMinutes: 4,
  authorName: "Example Author",
  categoryKey: "engineering",
  tagKeys: ["nextjs", "typescript"],
  featured: true,
};

const articleList = publicArticleListSchema.parse({
  locale: "en",
  posts: [summary],
});

const articleDetail = publicArticleDetailSchema.parse({
  locale: "en",
  post: {
    ...summary,
    seoTitle: "Typed public reads",
    seoDescription: "A strict public article.",
    canonicalUrl: null,
    renderedHtml: '<h2 id="intro">Introduction</h2><p>Safe body.</p>',
    headings: [{ depth: 2, id: "intro", text: "Introduction" }],
    alternates: [
      { locale: "en", slug: "typed-public-reads" },
      { locale: "fa", slug: "خواندن-عمومی-نوعدار" },
    ],
  },
});

describe("public articles API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function createApp(overrides: Readonly<Record<string, unknown>> = {}) {
    const service = {
      list: vi.fn().mockResolvedValue({
        data: articleList,
        nextCursor: null,
        lastModified: updatedAt,
      }),
      detail: vi.fn().mockResolvedValue({
        kind: "found",
        data: articleDetail,
        lastModified: updatedAt,
      }),
      ...overrides,
    };
    const moduleRef = await withStubbedAuth(
      Test.createTestingModule({ imports: [AppModule] })
    )
      .overrideProvider(CONTACT_SUBMISSION_SERVICE)
      .useValue({ submit: async () => undefined })
      .overrideProvider(PUBLIC_PROJECTS_SERVICE)
      .useValue({ read: async () => undefined })
      .overrideProvider(PUBLIC_SITE_SERVICE)
      .useValue({ read: async () => undefined })
      .overrideProvider(PUBLIC_APPEARANCE_SERVICE)
      .useValue({ read: async () => undefined })
      .overrideProvider(PUBLIC_HOME_SERVICE)
      .useValue({ read: async () => undefined })
      .overrideProvider(PUBLIC_ARTICLES_SERVICE)
      .useValue(service)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false })
    );
    configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return { app, service };
  }

  it("serves a strict cursor list with locale cache headers and 304", async () => {
    const fixture = await createApp();
    const first = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/en/blog/posts?limit=10",
    });
    expect(first.statusCode).toBe(200);
    expect(
      publicArticleListEnvelopeSchema.safeParse(first.json()).success
    ).toBe(true);
    expect(first.headers["content-language"]).toBe("en");
    expect(first.headers["cache-control"]).toContain("s-maxage=300");
    expect(fixture.service.list).toHaveBeenCalledWith("en", {
      limit: 10,
    });

    const conditional = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/en/blog/posts?limit=10",
      headers: { "if-none-match": first.headers.etag },
    });
    expect(conditional.statusCode).toBe(304);
    expect(conditional.body).toBe("");
  });

  it("validates locale, limit, cursor shape, and locale-specific detail slugs", async () => {
    const fixture = await createApp();
    const badList = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/ar/blog/posts?limit=1000",
    });
    expect(badList.statusCode).toBe(400);
    expect(badList.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
    expect(fixture.service.list).not.toHaveBeenCalled();

    const badSlug = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/en/blog/posts/عنوان-فارسی",
    });
    expect(badSlug.statusCode).toBe(400);
    expect(fixture.service.detail).not.toHaveBeenCalled();
  });

  it("serves strict detail and returns a bounded no-fallback 404 disclosure", async () => {
    const fixture = await createApp();
    const found = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/en/blog/posts/typed-public-reads",
    });
    expect(found.statusCode).toBe(200);
    expect(
      publicArticleDetailEnvelopeSchema.safeParse(found.json()).success
    ).toBe(true);
    expect(fixture.service.detail).toHaveBeenCalledWith(
      "en",
      "typed-public-reads"
    );
    await fixture.app.close();
    app = undefined;

    const missingFixture = await createApp({
      detail: vi.fn().mockResolvedValue({
        kind: "missing",
        availableTranslations: [{ locale: "en", slug: "typed-public-reads" }],
      }),
    });
    const missing = await missingFixture.app.inject({
      method: "GET",
      url: "/api/v1/public/fa/blog/posts/مقاله-ناقص",
    });
    expect(missing.statusCode).toBe(404);
    expect(
      publicArticleTranslationNotFoundSchema.safeParse(missing.json()).success
    ).toBe(true);
    expect(missing.body).not.toContain("draft");
    expect(missing.body).not.toContain("renderedHtml");
  });
});

describe("PublicArticlesService", () => {
  it("queries only discoverable translations and emits a stable cursor", async () => {
    const rows = [
      listRow(translationId, "typed-public-reads", publishedAt),
      listRow(
        secondTranslationId,
        "older-article",
        new Date("2026-08-13T12:00:00.000Z")
      ),
    ];
    const findMany = vi.fn().mockResolvedValue(rows);
    const service = new PublicArticlesService({
      postTranslation: { findMany },
    } as unknown as Database);

    const first = await service.list("en", { limit: 1 });
    expect(first.data.posts).toHaveLength(1);
    expect(first.data.posts[0]?.id).toBe(postId);
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        locale: "en",
        status: "PUBLISHED",
        archivedAt: null,
        renderedHtml: { not: null },
        rendererVersion: "1",
        bodyMarkdown: { not: null },
        bodySha256: { not: null },
        post: { archivedAt: null },
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 2,
    });

    await service.list("en", { limit: 1, cursor: first.nextCursor! });
    expect(findMany.mock.calls[1]?.[0].where.OR).toHaveLength(2);
    await expect(
      service.list("en", { limit: 1, cursor: "bm90LWpzb24" })
    ).rejects.toMatchObject({ name: "InvalidPublicArticleCursorError" });
  });

  it("serves only a published detail body and exposes only published alternates", async () => {
    const findUnique = vi.fn().mockResolvedValue(detailRow());
    const service = new PublicArticlesService({
      postTranslation: { findUnique },
    } as unknown as Database);
    const result = await service.detail("en", "typed-public-reads");

    expect(result.kind).toBe("found");
    if (result.kind !== "found") throw new Error("Expected article detail.");
    expect(result.data.post.renderedHtml).toContain("Safe body");
    expect(result.data.post).not.toHaveProperty("bodyMarkdown");
    expect(result.data.post).not.toHaveProperty("bodySha256");
    expect(result.data.post.alternates.map(({ locale }) => locale)).toEqual([
      "en",
      "fa",
    ]);
    expect(findUnique.mock.calls[0]?.[0].where).toEqual({
      locale_slug: { locale: "en", slug: "typed-public-reads" },
    });
  });

  it("treats a stale, malformed, or mismatched render as an article that is not there", async () => {
    // Not as an error. Throwing turned one corrupted row into a `500`, and a
    // `500` tells an unauthenticated caller that something is wrong with the
    // data. The public contract for an article whose source cannot be trusted
    // is that it does not exist.
    const faults = [
      { rendererVersion: "0" },
      { bodySha256: "not-a-sha256" },
      { bodySha256: "f".repeat(64) },
      { bodyMarkdown: null },
      { renderedHtml: null },
      { excerpt: null },
      { readingMinutes: null },
    ];
    const findUnique = vi.fn();
    for (const fault of faults) {
      findUnique.mockResolvedValueOnce(detailRow(fault));
    }
    const service = new PublicArticlesService({
      postTranslation: { findUnique },
    } as unknown as Database);

    for (const fault of faults) {
      const result = await service.detail("en", "typed-public-reads");
      expect(result.kind, JSON.stringify(fault)).toBe("missing");
      expect(JSON.stringify(result)).not.toContain("Safe body");
      expect(JSON.stringify(result)).not.toContain("digest");
    }
  });

  it("drops one corrupted row from a listing instead of failing the whole locale", async () => {
    // The regression this exists for: `list` used to assert integrity inside
    // its map, so a single bad row aborted discovery for every article in the
    // locale. Blog listing is not allowed to be that fragile.
    const healthy = listRow(translationId, "typed-public-reads", publishedAt);
    const corrupted = listRow(secondTranslationId, "older-article", updatedAt);
    corrupted.bodySha256 = "f".repeat(64);
    const service = new PublicArticlesService({
      postTranslation: {
        findMany: vi.fn().mockResolvedValue([healthy, corrupted]),
      },
    } as unknown as Database);

    const result = await service.list("en", { limit: 10 });

    expect(result.data.posts.map(({ slug }) => slug)).toEqual([
      "typed-public-reads",
    ]);
  });

  it("never returns another locale's body for draft, archived, or absent translations", async () => {
    const draft = detailRow({ status: "DRAFT", renderedHtml: "secret draft" });
    const draftPost = draft.post as {
      translations: Array<{ locale: string; slug: string; updatedAt: Date }>;
    };
    draftPost.translations = [
      { locale: "en", slug: "typed-public-reads", updatedAt },
    ];
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(null);
    const service = new PublicArticlesService({
      postTranslation: { findUnique },
    } as unknown as Database);

    await expect(service.detail("fa", "مقاله-ناقص")).resolves.toEqual({
      kind: "missing",
      availableTranslations: [{ locale: "en", slug: "typed-public-reads" }],
    });
    await expect(service.detail("fa", "وجود-ندارد")).resolves.toEqual({
      kind: "missing",
      availableTranslations: [],
    });
  });
});

function listRow(id: string, slug: string, date: Date) {
  return {
    id,
    slug,
    title: slug === "typed-public-reads" ? "Typed public reads" : "Older",
    excerpt: "A strict published summary.",
    publishedAt: date,
    readingMinutes: 4,
    updatedAt,
    bodyMarkdown,
    bodySha256,
    post: {
      id: postId,
      featured: true,
      updatedAt,
      author: { displayName: "Example Author" },
      category: { key: "engineering", enabled: true },
      tags: [
        { tag: { key: "typescript", enabled: true } },
        { tag: { key: "hidden", enabled: false } },
        { tag: { key: "nextjs", enabled: true } },
      ],
    },
  };
}

function detailRow(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    slug: "typed-public-reads",
    title: "Typed public reads",
    excerpt: "A strict published summary.",
    seoTitle: "Typed public reads",
    seoDescription: "A strict public article.",
    canonicalUrl: null,
    status: "PUBLISHED",
    publishedAt,
    readingMinutes: 4,
    headingTree: [{ depth: 2, id: "intro", text: "Introduction" }],
    renderedHtml: '<h2 id="intro">Introduction</h2><p>Safe body.</p>',
    rendererVersion: "1",
    bodyMarkdown,
    bodySha256,
    updatedAt,
    archivedAt: null,
    post: {
      id: postId,
      featured: true,
      updatedAt,
      archivedAt: null,
      author: { displayName: "Example Author" },
      category: { key: "engineering", enabled: true },
      tags: [{ tag: { key: "typescript", enabled: true } }],
      translations: [
        { locale: "fa", slug: "خواندن-عمومی-نوعدار", updatedAt },
        { locale: "en", slug: "typed-public-reads", updatedAt },
      ],
    },
    ...overrides,
  };
}

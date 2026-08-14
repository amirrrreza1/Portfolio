import type { Database } from "@portfolio/database";
import {
  publicProjectDetailEnvelopeSchema,
  publicProjectDetailSchema,
  publicProjectsEnvelopeSchema,
  publicProjectsSchema,
} from "@portfolio/contracts/portfolio";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApplication } from "../src/configure-app.js";
import { CONTACT_SUBMISSION_SERVICE } from "../src/modules/contact/contact.controller.js";
import { PUBLIC_APPEARANCE_SERVICE } from "../src/modules/public/public-appearance.controller.js";
import { PUBLIC_ARTICLES_SERVICE } from "../src/modules/public/public-articles.controller.js";
import { PUBLIC_HOME_SERVICE } from "../src/modules/public/public-home.controller.js";
import { PUBLIC_PROJECTS_SERVICE } from "../src/modules/public/public-projects.controller.js";
import { PublicProjectsService } from "../src/modules/public/public-projects.service.js";
import { PUBLIC_SITE_SERVICE } from "../src/modules/public/public-site.controller.js";

const categoryId = "c12345678901234567890123";
const skillId = "s12345678901234567890123";
const projectId = "p12345678901234567890123";
const lastModified = new Date("2026-08-14T14:58:34.000Z");

const publishedProjects = publicProjectsSchema.parse({
  locale: "fa",
  skillCategories: [
    {
      id: categoryId,
      key: "frameworks",
      name: "Frameworks",
      skills: [{ id: skillId, name: "Next.js", color: "#38bdf8" }],
    },
  ],
  projects: [
    {
      id: projectId,
      slug: "portfolio",
      title: "Portfolio",
      summary: "A public project summary.",
      status: "COMPLETED",
      demoUrl: null,
      repositoryUrl: "https://github.com/example/portfolio",
      featured: false,
      skillIds: [skillId],
      image: null,
    },
  ],
});

const publishedDetail = publicProjectDetailSchema.parse({
  locale: "fa",
  project: {
    ...publishedProjects.projects[0],
    longDescription: null,
    startedAt: null,
    completedAt: null,
    skills: publishedProjects.skillCategories[0]?.skills ?? [],
  },
});

describe("public projects API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function createApp(
    read = vi.fn().mockResolvedValue({
      data: publishedProjects,
      lastModified,
    }),
    overrides: Readonly<Record<string, unknown>> = {}
  ) {
    const service = {
      read,
      readDetail: vi.fn().mockResolvedValue({
        data: publishedDetail,
        lastModified,
      }),
      readImage: vi.fn().mockResolvedValue(null),
      ...overrides,
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONTACT_SUBMISSION_SERVICE)
      .useValue({ submit: async () => undefined })
      .overrideProvider(PUBLIC_PROJECTS_SERVICE)
      .useValue(service)
      .overrideProvider(PUBLIC_SITE_SERVICE)
      .useValue({ read: async () => undefined })
      .overrideProvider(PUBLIC_APPEARANCE_SERVICE)
      .useValue({ read: async () => undefined })
      .overrideProvider(PUBLIC_ARTICLES_SERVICE)
      .useValue({ list: async () => undefined, detail: async () => undefined })
      .overrideProvider(PUBLIC_HOME_SERVICE)
      .useValue({ read: async () => undefined })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false })
    );
    configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return { app, read, service };
  }

  it("serves a strict locale-scoped DTO with public cache headers", async () => {
    const fixture = await createApp();
    const response = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/fa/projects",
    });

    expect(response.statusCode).toBe(200);
    expect(
      publicProjectsEnvelopeSchema.safeParse(response.json()).success
    ).toBe(true);
    expect(response.headers["content-language"]).toBe("fa");
    expect(response.headers["cache-control"]).toContain("s-maxage=300");
    expect(response.headers.etag).toMatch(/^"[A-Za-z0-9_-]+"$/);
    expect(response.headers["last-modified"]).toBe(lastModified.toUTCString());
    expect(fixture.read).toHaveBeenCalledWith("fa");
  });

  it("returns 304 when the validated DTO ETag still matches", async () => {
    const fixture = await createApp();
    const first = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/fa/projects",
    });
    const response = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/fa/projects",
      headers: { "if-none-match": first.headers.etag },
    });

    expect(response.statusCode).toBe(304);
    expect(response.body).toBe("");
  });

  it("rejects an unknown locale before querying", async () => {
    const fixture = await createApp();
    const response = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/ar/projects",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
    expect(fixture.read).not.toHaveBeenCalled();
  });

  it("serves one strict localized detail and honors its ETag", async () => {
    const fixture = await createApp();
    const first = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/fa/projects/portfolio",
    });
    expect(first.statusCode).toBe(200);
    expect(
      publicProjectDetailEnvelopeSchema.safeParse(first.json()).success
    ).toBe(true);
    expect(first.headers["content-language"]).toBe("fa");
    expect(fixture.service.readDetail).toHaveBeenCalledWith("fa", "portfolio");

    const conditional = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/fa/projects/portfolio",
      headers: { "if-none-match": first.headers.etag },
    });
    expect(conditional.statusCode).toBe(304);
    expect(conditional.body).toBe("");
  });

  it("returns stable 400 and 404 responses for invalid or absent details", async () => {
    const readDetail = vi.fn().mockResolvedValue(null);
    const fixture = await createApp(undefined, { readDetail });
    const invalid = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/en/projects/Not_Canonical",
    });
    expect(invalid.statusCode).toBe(400);
    expect(readDetail).not.toHaveBeenCalled();

    const missing = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/en/projects/missing",
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("serves a verified image inline without exposing its storage key", async () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const readBytes = vi.fn().mockResolvedValue(bytes);
    const readImage = vi.fn().mockResolvedValue({
      mimeType: "image/png",
      checksumSha256: "a".repeat(64),
      lastModified,
      readBytes,
    });
    const fixture = await createApp(undefined, { readImage });
    const response = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/projects/portfolio/image",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["content-disposition"]).toBe("inline");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers.etag).toBe(`"sha256-${"a".repeat(64)}"`);
    expect(response.rawPayload).toEqual(Buffer.from(bytes));
    expect(response.body).not.toContain("storageKey");
  });
});

describe("PublicProjectsService", () => {
  it("filters public records, falls Persian fields back to English, and strips internal fields", async () => {
    const skillCategoryFindMany = vi.fn().mockResolvedValue([
      {
        id: categoryId,
        key: "frameworks",
        legacyId: 2,
        updatedAt: lastModified,
        translations: [
          { locale: "en", name: "Frameworks", updatedAt: lastModified },
        ],
        skills: [
          {
            id: skillId,
            name: "Next.js",
            color: "#38bdf8",
            legacyId: 202,
            updatedAt: lastModified,
          },
        ],
      },
    ]);
    const projectFindMany = vi.fn().mockResolvedValue([
      {
        id: projectId,
        slug: "portfolio",
        status: "COMPLETED",
        demoUrl: null,
        repositoryUrl: "https://github.com/example/portfolio",
        featured: false,
        legacyId: 1,
        version: 9,
        updatedAt: lastModified,
        image: null,
        translations: [
          {
            locale: "en",
            title: "Portfolio",
            summary: "A public project summary.",
            updatedAt: lastModified,
          },
        ],
        skills: [{ skillId }],
      },
    ]);
    const database = {
      skillCategory: { findMany: skillCategoryFindMany },
      project: { findMany: projectFindMany },
    } as unknown as Database;

    const result = await new PublicProjectsService(database, {
      read: vi.fn(),
    }).read("fa");

    expect(result.data).toEqual(publishedProjects);
    expect(result.lastModified).toEqual(lastModified);
    expect(JSON.stringify(result.data)).not.toContain("legacyId");
    expect(JSON.stringify(result.data)).not.toContain("version");
    expect(skillCategoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enabled: true } })
    );
    expect(projectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          enabled: true,
          archivedAt: null,
          status: { not: "ARCHIVED" },
        },
      })
    );
  });

  it("returns safe detail fields and reads only a verified public image", async () => {
    const read = vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]));
    const image = {
      storageKey: "media/123e4567-e89b-42d3-a456-426614174000.webp",
      mimeType: "image/webp",
      byteSize: 3n,
      checksumSha256: "b".repeat(64),
      width: 1600,
      height: 900,
      altText: null,
      kind: "IMAGE",
      processingState: "VERIFIED",
      visibility: "PUBLIC",
      archivedAt: null,
      updatedAt: lastModified,
    };
    const projectFindFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: projectId,
        slug: "portfolio",
        status: "COMPLETED",
        demoUrl: null,
        repositoryUrl: "https://github.com/example/portfolio",
        featured: true,
        startedAt: new Date("2025-01-02T00:00:00.000Z"),
        completedAt: null,
        updatedAt: lastModified,
        translations: [
          {
            locale: "en",
            title: "Portfolio",
            summary: "A public project summary.",
            longDescription: "## Details\n\nBuilt **safely**.",
            updatedAt: lastModified,
          },
        ],
        image,
        skills: [
          {
            skillId,
            skill: {
              name: "Next.js",
              color: "#38bdf8",
              updatedAt: lastModified,
            },
          },
        ],
      })
      .mockResolvedValueOnce({ updatedAt: lastModified, image });
    const database = {
      project: { findFirst: projectFindFirst },
    } as unknown as Database;
    const service = new PublicProjectsService(database, { read });

    const detail = await service.readDetail("fa", "portfolio");
    expect(detail?.data).toMatchObject({
      locale: "fa",
      project: {
        longDescription: "## Details\n\nBuilt **safely**.",
        startedAt: "2025-01-02",
        image: {
          src: "/api/v1/public/projects/portfolio/image",
          altText: "Portfolio project cover",
          mimeType: "image/webp",
          width: 1600,
          height: 900,
        },
      },
    });

    const file = await service.readImage("portfolio");
    await expect(file?.readBytes()).resolves.toEqual(
      Uint8Array.from([1, 2, 3])
    );
    expect(read).toHaveBeenCalledWith(image.storageKey);
    expect(JSON.stringify(detail?.data)).not.toContain("storageKey");
  });
});

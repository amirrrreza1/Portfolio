import type { Database } from "@portfolio/database";
import {
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
import { withStubbedAuth } from "./support/auth-overrides.js";
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
      title: "Portfolio",
      summary: "A public project summary.",
      status: "COMPLETED",
      demoUrl: null,
      repositoryUrl: "https://github.com/example/portfolio",
      featured: false,
      skillIds: [skillId],
    },
  ],
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
    const service = { read, ...overrides };
    const moduleRef = await withStubbedAuth(
      Test.createTestingModule({ imports: [AppModule] })
    )
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

  it("does not expose the removed project detail endpoint", async () => {
    const fixture = await createApp();
    const response = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/en/projects/portfolio",
    });

    expect(response.statusCode).toBe(404);
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

    const result = await new PublicProjectsService(database).read("fa");

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

  it("excludes an untranslated record instead of failing the whole collection", async () => {
    // A project created in the CMS before its English translation exists once
    // threw inside the list map, which returned 500 for the entire locale and
    // took the public site down with it.
    const skillCategoryFindMany = vi.fn().mockResolvedValue([
      {
        id: categoryId,
        key: "frameworks",
        updatedAt: lastModified,
        translations: [
          { locale: "en", name: "Frameworks", updatedAt: lastModified },
        ],
        skills: [
          {
            id: skillId,
            name: "Next.js",
            color: "#38bdf8",
            updatedAt: lastModified,
          },
        ],
      },
      {
        id: "c99999999999999999999999",
        key: "unfinished",
        updatedAt: lastModified,
        translations: [],
        skills: [],
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
        updatedAt: lastModified,
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
      {
        id: "p99999999999999999999999",
        slug: "drafted-in-the-cms",
        status: "IN_PROGRESS",
        demoUrl: null,
        repositoryUrl: null,
        featured: false,
        updatedAt: lastModified,
        translations: [],
        skills: [],
      },
    ]);
    const database = {
      skillCategory: { findMany: skillCategoryFindMany },
      project: { findMany: projectFindMany },
    } as unknown as Database;

    const result = await new PublicProjectsService(database).read("fa");

    expect(result.data).toEqual(publishedProjects);
  });
});

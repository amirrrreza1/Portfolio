import type { Database } from "@portfolio/database";
import {
  publicSiteEnvelopeSchema,
  publicSiteSchema,
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
import { PUBLIC_SITE_SERVICE } from "../src/modules/public/public-site.controller.js";
import { PublicSiteService } from "../src/modules/public/public-site.service.js";

const lastModified = new Date("2026-08-14T15:20:00.000Z");
const publishedSite = publicSiteSchema.parse({
  locale: "fa",
  settings: {
    canonicalSiteUrl: "http://localhost:3000",
    defaultLocale: "en",
    enabledLocales: ["en", "fa"],
    siteName: "امیررضا آذریون",
    titleTemplate: "%s | امیررضا آذریون",
    metaDescription: "وب‌سایت شخصی امیررضا آذریون",
    authorName: "Amirreza Azarioun",
    creatorName: "Amirreza Azarioun",
    publisherName: "Amirreza Azarioun",
    contactEnabled: true,
    githubUsername: "amirrrreza1",
    githubRepoAllowlist: ["Portfolio", "Morse-Code"],
    githubCacheTtlSeconds: 3_600,
    robotsAllowIndexing: false,
  },
  sections: [
    {
      key: "hero",
      title: "Amirreza Azarioun",
      content: {
        variant: "primary",
        lines: ["Hello There!", "I'm Amirreza Azarioun"],
        subtitle: "A Developer / Student / Learner",
        typingSpeed: 50,
        deletingSpeed: 30,
        pauseBetween: 3000,
        showRubikCube: true,
      },
    },
    {
      key: "about",
      title: "About Me",
      content: {
        location: "Tehran, Iran",
        role: "frontend developer",
        body: [
          "Hello, I’m **Amirreza Azarioun**, 25 years old, based in Tehran, Iran.",
        ],
      },
    },
  ],
  navigation: [
    {
      id: "navhome00000000000000000",
      label: "خانه",
      iconKey: null,
      targetKind: "SECTION_ANCHOR",
      target: "hero",
    },
  ],
  socialLinks: [
    {
      id: "socialgithub000000000000",
      label: "گیت‌هاب",
      iconKey: null,
      rel: null,
      kind: "SOCIAL",
      url: "https://github.com/amirrrreza1",
    },
  ],
});

describe("public site API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function createApp(
    read = vi.fn().mockResolvedValue({ data: publishedSite, lastModified })
  ) {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONTACT_SUBMISSION_SERVICE)
      .useValue({ submit: async () => undefined })
      .overrideProvider(PUBLIC_PROJECTS_SERVICE)
      .useValue({ read: async () => undefined })
      .overrideProvider(PUBLIC_SITE_SERVICE)
      .useValue({ read })
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
    return { app, read };
  }

  it("serves the strict locale-scoped site DTO with conditional caching", async () => {
    const fixture = await createApp();
    const first = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/fa/site",
    });

    expect(first.statusCode).toBe(200);
    expect(publicSiteEnvelopeSchema.safeParse(first.json()).success).toBe(true);
    expect(first.headers["content-language"]).toBe("fa");
    expect(first.headers["cache-control"]).toContain("s-maxage=300");
    expect(first.headers["last-modified"]).toBe(lastModified.toUTCString());
    expect(fixture.read).toHaveBeenCalledWith("fa");

    const conditional = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/fa/site",
      headers: { "if-none-match": first.headers.etag },
    });
    expect(conditional.statusCode).toBe(304);
    expect(conditional.body).toBe("");
  });

  it("rejects an unknown locale before querying", async () => {
    const fixture = await createApp();
    const response = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/ar/site",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
    expect(fixture.read).not.toHaveBeenCalled();
  });
});

describe("PublicSiteService", () => {
  it("filters enabled rows, falls Persian fields back, and strips private settings", async () => {
    const siteSettingsFindUnique = vi.fn().mockResolvedValue({
      canonicalSiteUrl: "http://localhost:3000",
      defaultLocale: "en",
      enabledLocales: ["en", "fa"],
      authorName: "Amirreza Azarioun",
      creatorName: "Amirreza Azarioun",
      publisherName: "Amirreza Azarioun",
      contactEnabled: true,
      githubUsername: "amirrrreza1",
      githubRepoAllowlist: ["Portfolio", "Morse-Code"],
      githubCacheTtlSeconds: 3_600,
      robotsAllowIndexing: false,
      birthDate: new Date("2000-08-15T00:00:00.000Z"),
      contactRecipientEmail: "private@example.invalid",
      searchConsoleTokens: { secret: true },
      updatedAt: lastModified,
      translations: [
        {
          locale: "fa",
          siteName: "امیررضا آذریون",
          titleTemplate: "%s | امیررضا آذریون",
          metaDescription: "وب‌سایت شخصی امیررضا آذریون",
          updatedAt: lastModified,
        },
      ],
    });
    const pageSectionFindMany = vi.fn().mockResolvedValue([
      {
        key: "hero",
        content: {
          variant: "primary",
          typingSpeed: 50,
          deletingSpeed: 30,
          pauseBetween: 3000,
          showRubikCube: true,
        },
        schemaVersion: 1,
        updatedAt: lastModified,
        translations: [
          {
            locale: "fa",
            title: null,
            content: {},
            updatedAt: lastModified,
          },
          {
            locale: "en",
            title: "Amirreza Azarioun",
            content: {
              lines: ["Hello There!", "I'm Amirreza Azarioun"],
              subtitle: "A Developer / Student / Learner",
            },
            updatedAt: lastModified,
          },
        ],
      },
      {
        key: "about",
        content: {},
        schemaVersion: 1,
        updatedAt: lastModified,
        translations: [
          {
            locale: "fa",
            title: null,
            content: {},
            updatedAt: lastModified,
          },
          {
            locale: "en",
            title: "About Me",
            content: {
              location: "Tehran, Iran",
              role: "frontend developer",
              body: [
                "Hello, I’m **Amirreza Azarioun**, {{age}} years old, based in Tehran, Iran.",
              ],
            },
            updatedAt: lastModified,
          },
        ],
      },
    ]);
    const navItemFindMany = vi.fn().mockResolvedValue([
      {
        id: "navhome00000000000000000",
        labelByLocale: { en: "Home", fa: "خانه" },
        targetKind: "SECTION_ANCHOR",
        target: "hero",
        iconKey: null,
        version: 3,
        updatedAt: lastModified,
      },
    ]);
    const socialLinkFindMany = vi.fn().mockResolvedValue([
      {
        id: "socialgithub000000000000",
        labelByLocale: { en: "GitHub", fa: "گیت‌هاب" },
        url: "https://github.com/amirrrreza1",
        iconKey: null,
        rel: null,
        kind: "SOCIAL",
        version: 2,
        updatedAt: lastModified,
      },
    ]);
    const database = {
      siteSettings: { findUnique: siteSettingsFindUnique },
      pageSection: { findMany: pageSectionFindMany },
      navItem: { findMany: navItemFindMany },
      socialLink: { findMany: socialLinkFindMany },
    } as unknown as Database;

    const result = await new PublicSiteService(
      database,
      () => new Date("2026-08-14T12:00:00.000Z")
    ).read("fa");

    expect(result.data).toEqual(publishedSite);
    expect(result.lastModified).toEqual(lastModified);
    expect(JSON.stringify(result.data)).not.toContain("contactRecipientEmail");
    expect(JSON.stringify(result.data)).not.toContain("searchConsoleTokens");
    expect(JSON.stringify(result.data)).not.toContain("version");
    expect(JSON.stringify(result.data)).not.toContain("2000-08-15");
    expect(JSON.stringify(result.data)).not.toContain("{{age}}");
    expect(pageSectionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { enabled: true, archivedAt: null },
      })
    );
    expect(navItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enabled: true } })
    );
    expect(socialLinkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enabled: true } })
    );
  });

  it("rejects unsafe inline Markdown from a published section", async () => {
    const database = {
      siteSettings: {
        findUnique: vi.fn().mockResolvedValue({
          canonicalSiteUrl: "http://localhost:3000",
          defaultLocale: "en",
          enabledLocales: ["en", "fa"],
          authorName: "Amirreza Azarioun",
          creatorName: "Amirreza Azarioun",
          publisherName: "Amirreza Azarioun",
          contactEnabled: true,
          githubUsername: "amirrrreza1",
          githubRepoAllowlist: [],
          githubCacheTtlSeconds: 3_600,
          robotsAllowIndexing: false,
          birthDate: null,
          updatedAt: lastModified,
          translations: [
            {
              locale: "en",
              siteName: "Amirreza Azarioun",
              titleTemplate: "%s | Amirreza Azarioun",
              metaDescription: "Portfolio site",
              updatedAt: lastModified,
            },
          ],
        }),
      },
      pageSection: {
        findMany: vi.fn().mockResolvedValue([
          {
            key: "about",
            content: {},
            updatedAt: lastModified,
            translations: [
              {
                locale: "en",
                title: "About Me",
                content: {
                  location: "Tehran, Iran",
                  role: "frontend developer",
                  body: ["Safe text <script>alert(1)</script>"],
                },
                updatedAt: lastModified,
              },
            ],
          },
        ]),
      },
      navItem: { findMany: vi.fn().mockResolvedValue([]) },
      socialLink: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as Database;

    await expect(new PublicSiteService(database).read("en")).rejects.toThrow(
      /html/i
    );
  });
});

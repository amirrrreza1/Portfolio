import {
  publicAppearanceEnvelopeSchema,
  publicAppearanceSchema,
} from "@portfolio/contracts/appearance";
import type { Database } from "@portfolio/database";
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
import { PublicAppearanceService } from "../src/modules/public/public-appearance.service.js";
import { PUBLIC_PROJECTS_SERVICE } from "../src/modules/public/public-projects.controller.js";
import { PUBLIC_SITE_SERVICE } from "../src/modules/public/public-site.controller.js";

const lastModified = new Date("2026-08-14T16:15:00.000Z");
const publishedAppearance = publicAppearanceSchema.parse({
  locale: "fa",
  themes: ["dark", "light"],
  defaultTheme: "dark",
  blogFonts: [
    { key: "vazir-code", displayName: "Vazir Code" },
    { key: "system-sans", displayName: "System sans" },
  ],
  defaultBlogFont: "vazir-code",
  blogSizes: ["sm", "md", "lg", "xl"],
  defaultBlogSize: "md",
  offerMotionToggle: true,
});

describe("public appearance API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function createApp(
    read = vi.fn().mockResolvedValue({
      data: publishedAppearance,
      lastModified,
    })
  ) {
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
      .useValue({ read })
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

  it("serves a strict locale-scoped allowlist with long cache headers", async () => {
    const fixture = await createApp();
    const first = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/fa/appearance",
    });

    expect(first.statusCode).toBe(200);
    expect(publicAppearanceEnvelopeSchema.safeParse(first.json()).success).toBe(
      true
    );
    expect(first.headers["content-language"]).toBe("fa");
    expect(first.headers["cache-control"]).toContain("s-maxage=3600");
    expect(first.headers["last-modified"]).toBe(lastModified.toUTCString());
    expect(fixture.read).toHaveBeenCalledWith("fa");

    const conditional = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/fa/appearance",
      headers: { "if-none-match": first.headers.etag },
    });
    expect(conditional.statusCode).toBe(304);
    expect(conditional.body).toBe("");
  });

  it("rejects an unknown locale before querying", async () => {
    const fixture = await createApp();
    const response = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/ar/appearance",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
    expect(fixture.read).not.toHaveBeenCalled();
  });
});

describe("PublicAppearanceService", () => {
  it("projects only registry-backed, script-compatible public options", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      enabledThemes: ["dark", "light"],
      defaultTheme: "dark",
      enabledBlogFonts: ["jetbrains-mono", "vazir-code", "system-sans"],
      defaultBlogFontByLocale: {
        en: "jetbrains-mono",
        fa: "vazir-code",
      },
      allowedBlogSizeSteps: ["sm", "md", "lg", "xl"],
      defaultBlogSizeStep: "md",
      offerMotionToggle: true,
      version: 8,
      updatedAt: lastModified,
    });
    const database = {
      appearanceSettings: { findUnique },
    } as unknown as Database;

    const result = await new PublicAppearanceService(database).read("fa");

    expect(result).toEqual({
      data: publishedAppearance,
      lastModified,
    });
    expect(JSON.stringify(result.data)).not.toContain("version");
    expect(JSON.stringify(result.data)).not.toContain(
      "defaultBlogFontByLocale"
    );
    expect(result.data.blogFonts.map((font) => font.key)).not.toContain(
      "jetbrains-mono"
    );
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        select: expect.not.objectContaining({ version: true }),
      })
    );
  });
});

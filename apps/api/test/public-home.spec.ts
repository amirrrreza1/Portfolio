import type { Database } from "@portfolio/database";
import {
  publicHomeEnvelopeSchema,
  publicHomeSchema,
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
import { PublicHomeService } from "../src/modules/public/public-home.service.js";
import { PUBLIC_PROJECTS_SERVICE } from "../src/modules/public/public-projects.controller.js";
import { PUBLIC_SITE_SERVICE } from "../src/modules/public/public-site.controller.js";

const lastModified = new Date("2026-08-14T16:00:00.000Z");
const certificateId = "c12345678901234567890123";
const publishedHome = publicHomeSchema.parse({
  locale: "fa",
  quote: {
    id: "q12345678901234567890123",
    text: "Ù†ÙˆØ´ØªÙ† Ú©Ø¯ ØªÙ…ÛŒØ² Ù…Ù‡Ù… Ø§Ø³Øª.",
    author: "Anonymous",
    sourceUrl: null,
  },
  certificates: [
    {
      id: certificateId,
      title: "Web Design 1",
      description: "HTML and CSS basics.",
      issuerName: "MFT",
      issuerUrl: "https://mftplus.com/",
      instructorName: "Turaj Armin",
      instructorUrl: "https://www.linkedin.com/in/turaj-armin-34ab14b6/",
      scoreText: "98/100",
      issuedAt: "2024-05-26",
      credentialUrl: null,
      downloadPath: `/api/v1/public/certificates/${certificateId}/file`,
    },
  ],
  resume: {
    label: "Resume",
    filename: "resume.pdf",
    downloadPath: "/api/v1/public/resume/file",
  },
});

describe("public homepage API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function createApp(
    options: {
      read?: ReturnType<typeof vi.fn>;
      readCertificateFile?: ReturnType<typeof vi.fn>;
      readResumeFile?: ReturnType<typeof vi.fn>;
    } = {}
  ) {
    const service = {
      read:
        options.read ??
        vi.fn().mockResolvedValue({ data: publishedHome, lastModified }),
      readCertificateFile:
        options.readCertificateFile ?? vi.fn().mockResolvedValue(null),
      readResumeFile: options.readResumeFile ?? vi.fn().mockResolvedValue(null),
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
      .overrideProvider(PUBLIC_ARTICLES_SERVICE)
      .useValue({ list: async () => undefined, detail: async () => undefined })
      .overrideProvider(PUBLIC_HOME_SERVICE)
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

  it("serves the locale-scoped home DTO with ETag revalidation", async () => {
    const fixture = await createApp();
    const first = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/fa/home",
    });

    expect(first.statusCode).toBe(200);
    expect(publicHomeEnvelopeSchema.safeParse(first.json()).success).toBe(true);
    expect(first.headers["content-language"]).toBe("fa");
    expect(first.headers["cache-control"]).toContain("s-maxage=300");
    expect(first.headers["last-modified"]).toBe(lastModified.toUTCString());
    expect(fixture.service.read).toHaveBeenCalledWith("fa");

    const conditional = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/fa/home",
      headers: { "if-none-match": first.headers.etag },
    });
    expect(conditional.statusCode).toBe(304);
    expect(conditional.body).toBe("");
  });

  it("serves verified PDFs without exposing an object key", async () => {
    const bytes = Buffer.from("%PDF-1.7\nproof", "utf8");
    const readBytes = vi.fn().mockResolvedValue(bytes);
    const readCertificateFile = vi.fn().mockResolvedValue({
      filename: "Certificate one.pdf",
      mimeType: "application/pdf",
      checksumSha256: "a".repeat(64),
      lastModified,
      readBytes,
    });
    const fixture = await createApp({ readCertificateFile });

    const first = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/public/certificates/${certificateId}/file`,
    });
    expect(first.statusCode).toBe(200);
    expect(first.rawPayload).toEqual(bytes);
    expect(first.headers["content-type"]).toContain("application/pdf");
    expect(first.headers["content-disposition"]).toContain("attachment;");
    expect(first.headers["x-content-type-options"]).toBe("nosniff");
    expect(first.body).not.toContain("storageKey");

    const conditional = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/public/certificates/${certificateId}/file`,
      headers: { "if-none-match": first.headers.etag },
    });
    expect(conditional.statusCode).toBe(304);
    expect(conditional.body).toBe("");
    expect(readBytes).toHaveBeenCalledOnce();
  });

  it("rejects malformed certificate IDs and returns 404 for no active resume", async () => {
    const fixture = await createApp();
    const invalid = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/certificates/1/file",
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });

    const missing = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/public/resume/file",
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});

describe("PublicHomeService", () => {
  it("filters public rows, falls back translations, and selects a quote by UTC date", async () => {
    const certificateFindMany = vi.fn().mockResolvedValue([
      {
        id: certificateId,
        issuerName: "MFT",
        issuerUrl: "https://mftplus.com/",
        instructorName: "Turaj Armin",
        instructorUrl: "https://www.linkedin.com/in/turaj-armin-34ab14b6/",
        scoreText: "98/100",
        issuedAt: new Date("2024-05-26T00:00:00.000Z"),
        credentialUrl: null,
        legacyId: 1,
        version: 7,
        updatedAt: lastModified,
        translations: [
          {
            locale: "en",
            title: "Web Design 1",
            description: "HTML and CSS basics.",
            updatedAt: lastModified,
          },
        ],
        media: { updatedAt: lastModified },
      },
    ]);
    const quoteFindMany = vi.fn().mockResolvedValue([
      {
        id: "q12345678901234567890121",
        textByLocale: { en: "First quote." },
        author: "First author",
        sourceUrl: null,
        pinned: false,
        updatedAt: lastModified,
      },
      {
        id: "q12345678901234567890122",
        textByLocale: { en: "Second quote.", fa: "Ù†Ù‚Ù„ Ù‚ÙˆÙ„ Ø¯ÙˆÙ…" },
        author: null,
        sourceUrl: null,
        pinned: false,
        updatedAt: lastModified,
      },
    ]);
    const resumeVersionFindFirst = vi.fn().mockResolvedValue({
      label: "Resume",
      publicFilename: "resume.pdf",
      updatedAt: lastModified,
      mediaAsset: { displayName: "internal.pdf", updatedAt: lastModified },
    });
    const database = {
      certificate: { findMany: certificateFindMany },
      quote: { findMany: quoteFindMany },
      resumeVersion: { findFirst: resumeVersionFindFirst },
    } as unknown as Database;
    const service = new PublicHomeService(
      database,
      { read: vi.fn() },
      () => new Date("2026-01-02T23:30:00.000Z")
    );

    const result = await service.read("fa");

    expect(result.data).toMatchObject({
      locale: "fa",
      quote: { text: "Ù†Ù‚Ù„ Ù‚ÙˆÙ„ Ø¯ÙˆÙ…", author: null },
      certificates: [
        {
          title: "Web Design 1",
          issuedAt: "2024-05-26",
          downloadPath: `/api/v1/public/certificates/${certificateId}/file`,
        },
      ],
      resume: {
        filename: "resume.pdf",
        downloadPath: "/api/v1/public/resume/file",
      },
    });
    expect(JSON.stringify(result.data)).not.toMatch(
      /legacyId|version|storageKey|checksumSha256/
    );
    expect(certificateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ enabled: true, archivedAt: null }),
      })
    );
    expect(quoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enabled: true } })
    );
  });

  it("excludes an unfinished certificate instead of failing the home read", async () => {
    // One certificate created in the CMS without an English translation, or
    // whose PDF is not yet verified, must not take the whole home page down.
    const certificateFindMany = vi.fn().mockResolvedValue([
      {
        id: certificateId,
        issuerName: "MFT",
        issuerUrl: "https://mftplus.com/",
        instructorName: "Turaj Armin",
        instructorUrl: "https://www.linkedin.com/in/turaj-armin-34ab14b6/",
        scoreText: "98/100",
        issuedAt: new Date("2024-05-26T00:00:00.000Z"),
        credentialUrl: null,
        updatedAt: lastModified,
        translations: [
          {
            locale: "en",
            title: "Web Design 1",
            description: "HTML and CSS basics.",
            updatedAt: lastModified,
          },
        ],
        media: { updatedAt: lastModified },
      },
      {
        id: "c99999999999999999999999",
        issuerName: "Institute",
        issuerUrl: null,
        instructorName: "Instructor",
        instructorUrl: null,
        scoreText: null,
        issuedAt: new Date("2026-08-01T00:00:00.000Z"),
        credentialUrl: null,
        updatedAt: lastModified,
        translations: [],
        media: { updatedAt: lastModified },
      },
      {
        id: "c88888888888888888888888",
        issuerName: "Institute",
        issuerUrl: null,
        instructorName: "Instructor",
        instructorUrl: null,
        scoreText: null,
        issuedAt: new Date("2026-08-02T00:00:00.000Z"),
        credentialUrl: null,
        updatedAt: lastModified,
        translations: [
          {
            locale: "en",
            title: "Awaiting its file",
            description: "The PDF has not been verified yet.",
            updatedAt: lastModified,
          },
        ],
        media: null,
      },
    ]);
    const database = {
      certificate: { findMany: certificateFindMany },
      quote: { findMany: vi.fn().mockResolvedValue([]) },
      resumeVersion: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as Database;

    const result = await new PublicHomeService(
      database,
      { read: vi.fn() },
      () => new Date("2026-01-02T23:30:00.000Z")
    ).read("en");

    expect(result.data.certificates).toHaveLength(1);
    expect(result.data.certificates[0]?.id).toBe(certificateId);
  });

  it("reads only an enabled certificate's verified public PDF and checks its size", async () => {
    const bytes = Buffer.from("%PDF-1.7\nproof", "utf8");
    const storageKey = "media/123e4567-e89b-42d3-a456-426614174000.pdf";
    const certificateFindFirst = vi.fn().mockResolvedValue({
      updatedAt: lastModified,
      media: {
        storageKey,
        displayName: "certificate.pdf",
        mimeType: "application/pdf",
        byteSize: BigInt(bytes.byteLength),
        checksumSha256: "b".repeat(64),
        updatedAt: lastModified,
      },
    });
    const reader = { read: vi.fn().mockResolvedValue(bytes) };
    const database = {
      certificate: { findFirst: certificateFindFirst },
    } as unknown as Database;
    const service = new PublicHomeService(database, reader);

    const file = await service.readCertificateFile(certificateId);
    expect(file).toMatchObject({
      filename: "certificate.pdf",
      mimeType: "application/pdf",
      checksumSha256: "b".repeat(64),
      lastModified,
    });
    expect(reader.read).not.toHaveBeenCalled();
    await expect(file?.readBytes()).resolves.toEqual(bytes);
    expect(reader.read).toHaveBeenCalledWith(storageKey);
    expect(certificateFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: certificateId,
          enabled: true,
          archivedAt: null,
        }),
      })
    );

    reader.read.mockResolvedValue(Buffer.from("short"));
    const mismatched = await service.readCertificateFile(certificateId);
    await expect(mismatched?.readBytes()).rejects.toThrow(
      "does not match its metadata"
    );
  });
});

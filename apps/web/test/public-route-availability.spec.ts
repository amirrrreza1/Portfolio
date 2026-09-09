import {
  publicAppearanceEnvelopeSchema,
  type PublicAppearanceEnvelope,
} from "@portfolio/contracts/appearance";
import {
  publicProjectsEnvelopeSchema,
  publicSiteEnvelopeSchema,
  type PublicProjectsEnvelope,
  type PublicSiteEnvelope,
} from "@portfolio/contracts/portfolio";
import { describe, expect, it, vi } from "vitest";

import {
  PublicApiResponseError,
  PublicDataUnavailableError,
  type PublicReadCache,
} from "../src/server/public-api-client";
import {
  classifyPublicRoute,
  createPublicRouteAvailabilityChecker,
  evaluatePublicRouteAvailability,
  type PublicRouteAvailabilityReaders,
} from "../src/server/public-route-availability";

const skillId = "s12345678901234567890123";

class TestCache implements PublicReadCache {
  readonly entries = new Map<string, unknown>();

  get(key: string): unknown {
    return this.entries.get(key);
  }

  set(key: string, value: unknown): void {
    this.entries.set(key, value);
  }
}

function appearanceEnvelope(): PublicAppearanceEnvelope {
  return publicAppearanceEnvelopeSchema.parse({
    data: {
      locale: "en",
      themes: ["dark", "light"],
      defaultTheme: "dark",
      blogFonts: [
        { key: "jetbrains-mono", displayName: "JetBrains Mono" },
        { key: "system-sans", displayName: "System sans" },
      ],
      defaultBlogFont: "jetbrains-mono",
      blogSizes: ["sm", "md", "lg", "xl"],
      defaultBlogSize: "md",
      offerMotionToggle: true,
    },
    meta: { requestId: "appearance-en" },
  });
}

function siteEnvelope(): PublicSiteEnvelope {
  return publicSiteEnvelopeSchema.parse({
    data: {
      locale: "en",
      settings: {
        canonicalSiteUrl: "https://example.test",
        defaultLocale: "en",
        enabledLocales: ["en", "fa"],
        siteName: "Example",
        titleTemplate: "%s | Example",
        metaDescription: "Example portfolio",
        keywords: ["portfolio"],
        footerLines: [],
        footerRights: "All rights reserved",
        resumeButtonLabel: "Download resume",
        siteVerification: { google: null, bing: null },
        authorName: "Example Owner",
        creatorName: "Example Owner",
        publisherName: "Example Owner",
        contactEnabled: true,
        githubUsername: null,
        githubRepoAllowlist: [],
        githubCacheTtlSeconds: 3_600,
        robotsAllowIndexing: false,
      },
      sections: [],
      navigation: [],
      socialLinks: [],
    },
    meta: { requestId: "site-en" },
  });
}

function projectsEnvelope(): PublicProjectsEnvelope {
  return publicProjectsEnvelopeSchema.parse({
    data: {
      locale: "en",
      projects: [],
      skillCategories: [
        {
          id: "c12345678901234567890123",
          key: "frameworks",
          name: "Frameworks",
          skills: [{ id: skillId, name: "Next.js", color: "#38bdf8" }],
        },
      ],
    },
    meta: { requestId: "projects-en" },
  });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { etag: '"gate-etag"' },
  });
}

function readers(
  overrides: Partial<PublicRouteAvailabilityReaders> = {}
): PublicRouteAvailabilityReaders {
  return {
    readAppearance: vi.fn().mockResolvedValue({}),
    readSite: vi.fn().mockResolvedValue({}),
    readHome: vi.fn().mockResolvedValue({}),
    readProjects: vi.fn().mockResolvedValue({}),
    readArticles: vi.fn().mockResolvedValue({}),
    readProjectDetail: vi.fn().mockResolvedValue({}),
    readArticleDetail: vi.fn().mockResolvedValue({}),
    readArticleTaxonomy: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe("public route availability gate", () => {
  it("classifies only canonical public documents and valid detail slugs", () => {
    expect(classifyPublicRoute("/en")).toEqual({
      locale: "en",
      resource: "home",
    });
    expect(classifyPublicRoute("/fa/projects")).toEqual({
      locale: "fa",
      resource: "projects",
    });
    expect(classifyPublicRoute("/en/projects/portfolio")).toEqual({
      locale: "en",
      resource: "project-detail",
      slug: "portfolio",
    });
    expect(classifyPublicRoute("/fa/blog")).toEqual({
      locale: "fa",
      resource: "articles",
    });
    expect(classifyPublicRoute("/fa/blog/مقاله-نمونه")).toEqual({
      locale: "fa",
      resource: "article-detail",
      slug: "مقاله-نمونه",
    });
    expect(classifyPublicRoute("/en/blog/category/engineering")).toEqual({
      locale: "en",
      resource: "article-taxonomy",
      kind: "category",
      slug: "engineering",
    });
    // Static segments win over `[slug]` in the router, so the gate has to
    // agree: `/en/blog/tag/x` is a taxonomy page, never an article called
    // "tag" with a trailing segment.
    expect(classifyPublicRoute("/fa/blog/tag/تایپ-اسکریپت")).toEqual({
      locale: "fa",
      resource: "article-taxonomy",
      kind: "tag",
      slug: "تایپ-اسکریپت",
    });
    expect(classifyPublicRoute("/en/blog/category/Not-A-Slug")).toBeNull();
    expect(classifyPublicRoute("/en/unknown")).toBeNull();
    expect(classifyPublicRoute("/en/projects/%2Fsecret")).toBeNull();
    expect(classifyPublicRoute("/de/projects")).toBeNull();
  });

  it("checks only the shared shell and resource needed by the route", async () => {
    const scopedReaders = readers();
    await expect(
      evaluatePublicRouteAvailability(
        { locale: "en", resource: "projects" },
        scopedReaders
      )
    ).resolves.toBe("available");

    expect(scopedReaders.readAppearance).toHaveBeenCalledWith("en");
    expect(scopedReaders.readSite).toHaveBeenCalledWith("en");
    expect(scopedReaders.readProjects).toHaveBeenCalledWith("en");
    expect(scopedReaders.readHome).not.toHaveBeenCalled();
    expect(scopedReaders.readProjectDetail).not.toHaveBeenCalled();
    expect(scopedReaders.readArticles).not.toHaveBeenCalled();
    expect(scopedReaders.readArticleDetail).not.toHaveBeenCalled();

    const homeReaders = readers();
    await expect(
      evaluatePublicRouteAvailability(
        { locale: "en", resource: "home" },
        homeReaders
      )
    ).resolves.toBe("available");
    expect(homeReaders.readHome).toHaveBeenCalledWith("en");
    expect(homeReaders.readProjects).toHaveBeenCalledWith("en");
    expect(homeReaders.readProjectDetail).not.toHaveBeenCalled();

    const articleReaders = readers();
    await expect(
      evaluatePublicRouteAvailability(
        { locale: "fa", resource: "article-detail", slug: "مقاله-نمونه" },
        articleReaders
      )
    ).resolves.toBe("available");
    expect(articleReaders.readArticleDetail).toHaveBeenCalledWith(
      "fa",
      "مقاله-نمونه"
    );
    expect(articleReaders.readSite).toHaveBeenCalledWith("en");
    expect(articleReaders.readArticles).not.toHaveBeenCalled();

    const taxonomyReaders = readers();
    await expect(
      evaluatePublicRouteAvailability(
        {
          locale: "en",
          resource: "article-taxonomy",
          kind: "tag",
          slug: "typescript",
        },
        taxonomyReaders
      )
    ).resolves.toBe("available");
    expect(taxonomyReaders.readArticleTaxonomy).toHaveBeenCalledWith(
      "en",
      "tag",
      "typescript"
    );
    expect(taxonomyReaders.readArticles).not.toHaveBeenCalled();
    expect(taxonomyReaders.readArticleDetail).not.toHaveBeenCalled();
  });

  it("reports controlled outages but preserves missing-project 404 semantics", async () => {
    await expect(
      evaluatePublicRouteAvailability(
        { locale: "en", resource: "home" },
        readers({
          readAppearance: async () => {
            throw new PublicDataUnavailableError();
          },
        })
      )
    ).resolves.toBe("unavailable");

    await expect(
      evaluatePublicRouteAvailability(
        { locale: "en", resource: "home" },
        readers({
          readProjects: async () => {
            throw new PublicDataUnavailableError();
          },
        })
      )
    ).resolves.toBe("unavailable");

    await expect(
      evaluatePublicRouteAvailability(
        { locale: "en", resource: "project-detail", slug: "missing" },
        readers({
          readProjectDetail: async () => {
            throw new PublicApiResponseError(404);
          },
        })
      )
    ).resolves.toBe("available");

    // A withdrawn category is a canonical route-level 404: the API replied,
    // and its reply was "no". It must not become a site-wide `503`.
    await expect(
      evaluatePublicRouteAvailability(
        {
          locale: "en",
          resource: "article-taxonomy",
          kind: "category",
          slug: "withdrawn",
        },
        readers({
          readArticleTaxonomy: async () => {
            throw new PublicApiResponseError(404);
          },
        })
      )
    ).resolves.toBe("not-found");

    await expect(
      evaluatePublicRouteAvailability(
        { locale: "en", resource: "projects" },
        readers({
          readProjects: async () => {
            throw new PublicApiResponseError(403);
          },
        })
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows validated last-known-good data and rejects cold or expired outages", async () => {
    let currentTime = 1_000;
    let online = true;
    const cache = new TestCache();
    const request = vi.fn(async (input: URL | RequestInfo) => {
      if (!online) throw new Error("offline");
      const pathname = new URL(input instanceof URL ? input : input.toString())
        .pathname;
      if (pathname.endsWith("/appearance"))
        return jsonResponse(appearanceEnvelope());
      if (pathname.endsWith("/site")) return jsonResponse(siteEnvelope());
      if (pathname.endsWith("/projects"))
        return jsonResponse(projectsEnvelope());
      throw new Error("unexpected public route");
    });
    const check = createPublicRouteAvailabilityChecker({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: request as unknown as typeof fetch,
      cache,
      now: () => currentTime,
      maxStaleMs: 10_000,
      onStale: vi.fn(),
    });

    await expect(check("/en/projects")).resolves.toBe("available");
    online = false;
    currentTime = 11_000;
    await expect(check("/en/projects")).resolves.toBe("available");
    currentTime = 11_001;
    await expect(check("/en/projects")).resolves.toBe("unavailable");

    const cold = createPublicRouteAvailabilityChecker({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: vi.fn().mockRejectedValue(new Error("offline")),
      cache: new TestCache(),
      maxStaleMs: 10_000,
    });
    await expect(cold("/en/projects")).resolves.toBe("unavailable");
  });
});

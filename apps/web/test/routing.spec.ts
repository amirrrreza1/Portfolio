import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import {
  articlePath,
  blogIndexPath,
  blogTaxonomyPath,
  decodeSlugParam,
  legacyLocaleRedirect,
  localePath,
} from "../src/i18n/routing";
import { proxyWithDependencies } from "../src/proxy";

describe("locale routing", () => {
  it("prefixes blog paths only", () => {
    expect(localePath("en")).toBe("/");
    expect(localePath("fa", "/projects/")).toBe("/projects");
    expect(articlePath("fa", "خواندن-عمومی-نوعدار")).toBe(
      "/fa/blog/%D8%AE%D9%88%D8%A7%D9%86%D8%AF%D9%86-%D8%B9%D9%85%D9%88%D9%85%DB%8C-%D9%86%D9%88%D8%B9%D8%AF%D8%A7%D8%B1"
    );
  });

  it("retires localized portfolio URLs while preserving blog locales", () => {
    expect(legacyLocaleRedirect("/")).toBeNull();
    expect(legacyLocaleRedirect("/projects")).toBeNull();
    expect(legacyLocaleRedirect("/en")).toBe("/");
    expect(legacyLocaleRedirect("/fa")).toBe("/");
    expect(legacyLocaleRedirect("/en/projects/portfolio")).toBeNull();
    expect(legacyLocaleRedirect("/fa/projects")).toBe("/projects");
    expect(legacyLocaleRedirect("/blog")).toBe("/en/blog");
  });

  it("does not redirect canonical or unknown paths", () => {
    expect(legacyLocaleRedirect("/projects")).toBeNull();
    expect(legacyLocaleRedirect("/fa/blog")).toBeNull();
    expect(legacyLocaleRedirect("/unknown")).toBeNull();
  });
});

describe("English portfolio routing", () => {
  it("keeps root English regardless of browser or stale locale preference", async () => {
    const cookieRequest = new NextRequest("https://example.test/", {
      headers: {
        accept: "text/html",
        "accept-language": "en-US,en;q=0.9",
        cookie: "portfolio_locale=fa",
      },
    });
    const cookieResponse = await proxyWithDependencies(cookieRequest, {
      dataSource: "legacy",
    });
    expect(cookieResponse.status).toBe(200);
    expect(cookieResponse.headers.get("x-middleware-rewrite")).toBe(
      "https://example.test/en"
    );
    expect(cookieResponse.headers.get("location")).toBeNull();
    expect(cookieResponse.headers.get("vary")).toBeNull();

    const prefixedResponse = await proxyWithDependencies(
      new NextRequest("https://example.test/en/projects", {
        headers: { "accept-language": "fa" },
      }),
      { dataSource: "legacy" }
    );
    expect(prefixedResponse.status).toBe(308);
    expect(prefixedResponse.headers.get("location")).toBe(
      "https://example.test/projects"
    );
    expect(prefixedResponse.headers.get("vary")).toBeNull();
  });

  it("collapses a trailing slash and the locale prefix into one redirect", async () => {
    for (const [from, to] of [
      ["/projects/", "/projects"],
      ["/blog/", "/en/blog"],
    ] as const) {
      const response = await proxyWithDependencies(
        new NextRequest(`https://example.test${from}`)
      );
      expect(response.status).toBe(308);
      expect(new URL(response.headers.get("location")!).pathname).toBe(to);
    }
  });

  it("canonicalizes a trailing slash on a locale-prefixed route in one hop", async () => {
    const response = await proxyWithDependencies(
      new NextRequest("https://example.test/en/blog/")
    );
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!).pathname).toBe(
      "/en/blog"
    );
  });

  it("returns a secure localized 503 before rendering unavailable database routes", async () => {
    const response = await proxyWithDependencies(
      new NextRequest("https://example.test/projects"),
      {
        dataSource: "database",
        checkAvailability: async () => "unavailable",
      }
    );
    const html = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("content-language")).toBe("en");
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'self'"
    );
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("API_INTERNAL_ORIGIN");
  });

  it("continues normal rendering for available or explicit legacy routes", async () => {
    const available = await proxyWithDependencies(
      new NextRequest("https://example.test/projects"),
      {
        dataSource: "database",
        checkAvailability: async () => "available",
      }
    );
    expect(available.status).toBe(200);
    expect(available.headers.get("x-middleware-rewrite")).toBe(
      "https://example.test/en/projects"
    );

    let checked = false;
    const legacy = await proxyWithDependencies(
      new NextRequest("https://example.test/projects"),
      {
        dataSource: "legacy",
        checkAvailability: async () => {
          checked = true;
          return "unavailable";
        },
      }
    );
    expect(legacy.status).toBe(200);
    expect(checked).toBe(false);

    const post = await proxyWithDependencies(
      new NextRequest("https://example.test/projects", { method: "POST" }),
      {
        dataSource: "database",
        checkAvailability: async () => {
          checked = true;
          return "unavailable";
        },
      }
    );
    expect(post.status).toBe(200);
    expect(checked).toBe(false);
  });
});

describe("dynamic slug parameters", () => {
  it("round-trips the link the blog index generates", () => {
    // The defect this covers: Next.js hands `[slug]` through percent-encoded
    // for a non-ASCII segment, so validating the raw param made every Persian
    // article 404 — including from its own link on the blog index.
    const slug = "ماتریس-تم";
    const href = articlePath("fa", slug);
    const param = href.slice("/fa/blog/".length);

    expect(param).not.toBe(slug);
    expect(decodeSlugParam(param)).toBe(slug);
  });

  it("leaves an already-decoded parameter alone", () => {
    expect(decodeSlugParam("typed-public-reads")).toBe("typed-public-reads");
  });

  it("reports a malformed escape instead of throwing", () => {
    // A route must answer 404 for this, not 500.
    expect(decodeSlugParam("%E0%A4%A")).toBe(null);
    expect(decodeSlugParam("%")).toBe(null);
  });
});

describe("blog discovery paths", () => {
  it("keeps the taxonomy segment ASCII while the slug stays localized", () => {
    expect(blogTaxonomyPath("en", "category", "engineering")).toBe(
      "/en/blog/category/engineering"
    );
    expect(blogTaxonomyPath("fa", "tag", "تایپ-اسکریپت")).toBe(
      `/fa/blog/tag/${encodeURIComponent("تایپ-اسکریپت")}`
    );
  });

  it("refuses a slug that is not canonical for the locale it is built for", () => {
    // A path builder that normalized silently would publish a canonical URL
    // the author never chose, which is the same reason `slugSchemaFor`
    // rejects rather than fixes.
    expect(() => blogTaxonomyPath("en", "tag", "Not-A-Slug")).toThrow();
  });

  it("leaves the first page of the index without a query string", () => {
    expect(blogIndexPath("en")).toBe("/en/blog");
    expect(blogIndexPath("en", null)).toBe("/en/blog");
    expect(blogIndexPath("fa", "abc_-9")).toBe("/fa/blog?cursor=abc_-9");
  });
});

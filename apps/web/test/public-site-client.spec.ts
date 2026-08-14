import {
  publicSiteEnvelopeSchema,
  publicSiteSchema,
} from "@portfolio/contracts/portfolio";
import { describe, expect, it, vi } from "vitest";

import {
  createPublicSiteClient,
  PublicDataUnavailableError,
  type PublicReadCache,
} from "../src/server/public-api-client";

function site(locale: "en" | "fa") {
  const fa = locale === "fa";
  return publicSiteSchema.parse({
    locale,
    settings: {
      canonicalSiteUrl: "http://localhost:3000",
      defaultLocale: "en",
      enabledLocales: ["en", "fa"],
      siteName: fa ? "امیررضا آذریون" : "Amirreza Azarioun",
      titleTemplate: fa ? "%s | امیررضا آذریون" : "%s | Amirreza Azarioun",
      metaDescription: fa
        ? "وب‌سایت شخصی امیررضا آذریون"
        : "Amirreza Azarioun's portfolio site",
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
        title: fa ? "امیررضا آذریون" : "Amirreza Azarioun",
        content: {
          variant: "primary",
          lines: [fa ? "توسعه‌دهنده فرانت‌اند" : "Frontend Developer"],
        },
      },
    ],
    navigation: [
      {
        id: "navhome00000000000000000",
        label: fa ? "خانه" : "Home",
        iconKey: null,
        targetKind: "SECTION_ANCHOR",
        target: "hero",
      },
    ],
    socialLinks: [
      {
        id: "socialgithub000000000000",
        label: fa ? "گیت‌هاب" : "GitHub",
        iconKey: null,
        rel: null,
        kind: "SOCIAL",
        url: "https://github.com/amirrrreza1",
      },
    ],
  });
}

function envelope(locale: "en" | "fa") {
  return publicSiteEnvelopeSchema.parse({
    data: site(locale),
    meta: { requestId: `site-${locale}` },
  });
}

class TestCache implements PublicReadCache {
  readonly entries = new Map<string, unknown>();

  get(key: string): unknown {
    return this.entries.get(key);
  }

  set(key: string, value: unknown): void {
    this.entries.set(key, value);
  }
}

describe("public site API client", () => {
  it("validates site data and uses a resource- and locale-specific cache tag", async () => {
    const cache = new TestCache();
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(envelope("fa")), {
        status: 200,
        headers: { etag: '"site-etag"' },
      })
    );
    const read = createPublicSiteClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: request as unknown as typeof fetch,
      cache,
      now: () => 2_000,
    });

    await expect(read("fa")).resolves.toEqual({
      envelope: envelope("fa"),
      stale: false,
    });
    expect(request).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:4000/api/v1/public/fa/site"),
      expect.objectContaining({
        next: { revalidate: 300, tags: ["public:site:fa"] },
      })
    );
    expect(cache.entries.get("public:site:fa")).toMatchObject({
      etag: '"site-etag"',
      validatedAt: 2_000,
    });
    expect(cache.entries.has("public:projects:fa")).toBe(false);
  });

  it("fails closed on a cross-locale site response", async () => {
    const read = createPublicSiteClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(envelope("en")), {
          status: 200,
          headers: { etag: '"site-etag"' },
        })
      ) as unknown as typeof fetch,
      cache: new TestCache(),
    });

    await expect(read("fa")).rejects.toBeInstanceOf(PublicDataUnavailableError);
  });
});

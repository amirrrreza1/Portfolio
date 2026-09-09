import {
  publicAppearanceEnvelopeSchema,
  publicAppearanceSchema,
} from "@portfolio/contracts/appearance";
import { describe, expect, it, vi } from "vitest";

import {
  createPublicAppearanceClient,
  PublicDataUnavailableError,
  type PublicReadCache,
} from "../src/server/public-api-client";

function appearance(locale: "en" | "fa") {
  const fonts =
    locale === "fa"
      ? [
          { key: "vazir-code" as const, displayName: "Shabnam" },
          { key: "system-sans" as const, displayName: "System sans" },
        ]
      : [
          { key: "jetbrains-mono" as const, displayName: "JetBrains Mono" },
          { key: "system-sans" as const, displayName: "System sans" },
        ];
  return publicAppearanceSchema.parse({
    locale,
    themes: ["dark", "light"],
    defaultTheme: "dark",
    blogFonts: fonts,
    defaultBlogFont: locale === "fa" ? "vazir-code" : "jetbrains-mono",
    blogSizes: ["sm", "md", "lg", "xl"],
    defaultBlogSize: "md",
    offerMotionToggle: true,
  });
}

function envelope(locale: "en" | "fa") {
  return publicAppearanceEnvelopeSchema.parse({
    data: appearance(locale),
    meta: { requestId: `appearance-${locale}` },
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

describe("public appearance API client", () => {
  it("uses a locale-scoped shared-data tag without appearance-cookie input", async () => {
    const cache = new TestCache();
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(envelope("fa")), {
        status: 200,
        headers: { etag: '"appearance-etag"' },
      })
    );
    const read = createPublicAppearanceClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: request as unknown as typeof fetch,
      cache,
      now: () => 4_000,
    });

    await expect(read("fa")).resolves.toEqual({
      envelope: envelope("fa"),
      stale: false,
    });
    expect(request).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:4000/api/v1/public/fa/appearance"),
      expect.objectContaining({
        headers: { accept: "application/json" },
        next: { revalidate: 3_600, tags: ["public:appearance:fa"] },
      })
    );
    expect(cache.entries.get("public:appearance:fa")).toMatchObject({
      etag: '"appearance-etag"',
      validatedAt: 4_000,
    });
  });

  it("fails closed on a cross-locale appearance response", async () => {
    const read = createPublicAppearanceClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(envelope("en")), {
          status: 200,
          headers: { etag: '"appearance-etag"' },
        })
      ) as unknown as typeof fetch,
      cache: new TestCache(),
    });

    await expect(read("fa")).rejects.toBeInstanceOf(PublicDataUnavailableError);
  });
});

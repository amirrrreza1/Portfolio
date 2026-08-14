import {
  publicHomeEnvelopeSchema,
  publicHomeSchema,
} from "@portfolio/contracts/portfolio";
import { describe, expect, it, vi } from "vitest";

import {
  createPublicHomeClient,
  PublicDataUnavailableError,
  type PublicReadCache,
} from "../src/server/public-api-client";

function home(locale: "en" | "fa") {
  return publicHomeSchema.parse({
    locale,
    quote: null,
    certificates: [],
    resume: null,
  });
}

function envelope(locale: "en" | "fa") {
  return publicHomeEnvelopeSchema.parse({
    data: home(locale),
    meta: { requestId: `home-${locale}` },
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

describe("public homepage API client", () => {
  it("uses its own locale-scoped endpoint, tag, and cache namespace", async () => {
    const cache = new TestCache();
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(envelope("fa")), {
        status: 200,
        headers: { etag: '"home-etag"' },
      })
    );
    const read = createPublicHomeClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: request as unknown as typeof fetch,
      cache,
      now: () => 5_000,
    });

    await expect(read("fa")).resolves.toEqual({
      envelope: envelope("fa"),
      stale: false,
    });
    expect(request).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:4000/api/v1/public/fa/home"),
      expect.objectContaining({
        next: { revalidate: 300, tags: ["public:home:fa"] },
      })
    );
    expect(cache.entries.get("public:home:fa")).toMatchObject({
      etag: '"home-etag"',
      validatedAt: 5_000,
    });
    expect(cache.entries.has("public:projects:fa")).toBe(false);
  });

  it("fails closed on a cross-locale homepage response", async () => {
    const read = createPublicHomeClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(envelope("en")), {
          status: 200,
          headers: { etag: '"home-etag"' },
        })
      ) as unknown as typeof fetch,
      cache: new TestCache(),
    });

    await expect(read("fa")).rejects.toBeInstanceOf(PublicDataUnavailableError);
  });
});

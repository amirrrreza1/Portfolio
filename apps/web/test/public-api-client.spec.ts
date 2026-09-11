import {
  publicProjectsEnvelopeSchema,
  publicProjectsSchema,
} from "@portfolio/contracts/portfolio";
import { describe, expect, it, vi } from "vitest";

import {
  createPublicProjectsClient,
  PublicApiResponseError,
  PublicDataUnavailableError,
  type PublicReadCache,
} from "../src/server/public-api-client";

const skillId = "s12345678901234567890123";

function envelope(locale: "en" | "fa") {
  return publicProjectsEnvelopeSchema.parse({
    data: {
      locale,
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
    meta: { requestId: `request-${locale}` },
  });
}

class TestCache implements PublicReadCache {
  readonly entries = new Map<string, unknown>();

  get(key: string): unknown {
    return this.entries.get(key);
  }

  set(key: string, value: never): void {
    this.entries.set(key, value);
  }
}

function jsonResponse(value: unknown, etag = '"etag-1"'): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json", etag },
  });
}

describe("public API last-known-good client", () => {
  it("validates a response, records its ETag, and sends the locale cache tag", async () => {
    const cache = new TestCache();
    const request = vi.fn().mockResolvedValue(jsonResponse(envelope("fa")));
    const read = createPublicProjectsClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: request as unknown as typeof fetch,
      cache,
      now: () => 1_000,
    });

    await expect(read("fa")).resolves.toEqual({
      envelope: envelope("fa"),
      stale: false,
    });
    expect(request).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:4000/api/v1/public/fa/projects"),
      expect.objectContaining({
        next: { revalidate: 300, tags: ["public:projects:fa"] },
      })
    );
    expect(cache.entries.get("public:projects:fa")).toMatchObject({
      etag: '"etag-1"',
      validatedAt: 1_000,
    });
  });

  it("reuses a fresh process entry when the Proxy gate opts in", async () => {
    let currentTime = 1_000;
    const cache = new TestCache();
    const request = vi.fn().mockResolvedValue(jsonResponse(envelope("en")));
    const read = createPublicProjectsClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: request as unknown as typeof fetch,
      cache,
      now: () => currentTime,
      reuseFresh: true,
    });

    await expect(read("en")).resolves.toMatchObject({ stale: false });
    currentTime = 2_000;
    await expect(read("en")).resolves.toMatchObject({ stale: false });

    expect(request).toHaveBeenCalledOnce();
  });

  it("serves a validated warm value during a retryable outage", async () => {
    let currentTime = 1_000;
    const cache = new TestCache();
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(envelope("en")))
      .mockRejectedValueOnce(new Error("connection refused"));
    const onStale = vi.fn();
    const read = createPublicProjectsClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: request as unknown as typeof fetch,
      cache,
      now: () => currentTime,
      onStale,
    });

    await read("en");
    currentTime = 31_000;

    await expect(read("en")).resolves.toMatchObject({ stale: true });
    expect(onStale).toHaveBeenCalledWith({
      key: "public:projects:en",
      ageMs: 30_000,
    });
  });

  it("fails a cold outage and an expired warm outage", async () => {
    const cold = createPublicProjectsClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: vi
        .fn()
        .mockRejectedValue(new Error("offline")) as unknown as typeof fetch,
      cache: new TestCache(),
      now: () => 10_000,
      maxStaleMs: 1_000,
    });
    await expect(cold("en")).rejects.toBeInstanceOf(PublicDataUnavailableError);

    const cache = new TestCache();
    cache.entries.set("public:projects:en", {
      envelope: envelope("en"),
      etag: '"etag"',
      validatedAt: 1_000,
    });
    const expired = createPublicProjectsClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: vi
        .fn()
        .mockRejectedValue(new Error("offline")) as unknown as typeof fetch,
      cache,
      now: () => 2_001,
      maxStaleMs: 1_000,
    });
    await expect(expired("en")).rejects.toBeInstanceOf(
      PublicDataUnavailableError
    );
  });

  it("ignores malformed cache data and never crosses locale keys", async () => {
    const cache = new TestCache();
    cache.entries.set("public:projects:en", {
      envelope: { data: { locale: "en", projects: "leaked" } },
      etag: '"bad"',
      validatedAt: 1_000,
    });
    cache.entries.set("public:projects:fa", {
      envelope: envelope("en"),
      etag: '"wrong-locale"',
      validatedAt: 1_000,
    });
    const read = createPublicProjectsClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: vi
        .fn()
        .mockRejectedValue(new Error("offline")) as unknown as typeof fetch,
      cache,
      now: () => 1_500,
    });

    await expect(read("en")).rejects.toBeInstanceOf(PublicDataUnavailableError);
    await expect(read("fa")).rejects.toBeInstanceOf(PublicDataUnavailableError);
  });

  it("refreshes a valid cache entry on 304", async () => {
    const cache = new TestCache();
    cache.entries.set("public:projects:en", {
      envelope: envelope("en"),
      etag: '"etag-1"',
      validatedAt: 1_000,
    });
    const request = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 304 }));
    const read = createPublicProjectsClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: request as unknown as typeof fetch,
      cache,
      now: () => 2_000,
    });

    await expect(read("en")).resolves.toMatchObject({ stale: false });
    expect(cache.entries.get("public:projects:en")).toMatchObject({
      validatedAt: 2_000,
    });
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "if-none-match": '"etag-1"' }),
    });
  });

  it("does not hide a non-retryable API response behind stale data", async () => {
    const cache = new TestCache();
    cache.entries.set("public:projects:en", {
      envelope: envelope("en"),
      etag: '"etag"',
      validatedAt: 1_000,
    });
    const read = createPublicProjectsClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status: 404 })
        ) as unknown as typeof fetch,
      cache,
      now: () => 1_500,
    });

    await expect(read("en")).rejects.toBeInstanceOf(PublicApiResponseError);
  });

  it("rejects a cross-locale 200 response", async () => {
    const read = createPublicProjectsClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: vi
        .fn()
        .mockResolvedValue(
          jsonResponse(envelope("en"))
        ) as unknown as typeof fetch,
      cache: new TestCache(),
    });

    await expect(read("fa")).rejects.toBeInstanceOf(PublicDataUnavailableError);
  });

  it.each([
    "not a URL",
    "ftp://api.example.com",
    "https://user:secret@api.example.com",
    "https://api.example.com/base",
  ])("rejects unsafe API origin %s", (origin) => {
    expect(() => createPublicProjectsClient({ apiOrigin: origin })).toThrow();
  });
});

describe("public project fixture", () => {
  it("remains accepted by the strict public DTO", () => {
    expect(publicProjectsSchema.safeParse(envelope("en").data).success).toBe(
      true
    );
  });
});

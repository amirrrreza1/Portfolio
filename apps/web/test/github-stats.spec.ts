import type { PublicSiteSettings } from "@portfolio/contracts/portfolio";
import { describe, expect, it, vi } from "vitest";

import {
  createGitHubStatsReader,
  parseGitHubRepositoryUrl,
  type GitHubStatsCache,
} from "../src/server/github-stats-source";

const settings = {
  githubUsername: "amirrrreza1",
  githubRepoAllowlist: ["Portfolio"],
  githubCacheTtlSeconds: 60,
} satisfies Pick<
  PublicSiteSettings,
  "githubUsername" | "githubRepoAllowlist" | "githubCacheTtlSeconds"
>;
const repositoryUrl = "https://github.com/amirrrreza1/Portfolio";

class TestCache implements GitHubStatsCache {
  readonly entries = new Map<string, unknown>();

  get(key: string): unknown {
    return this.entries.get(key);
  }

  set(key: string, value: unknown): void {
    this.entries.set(key, value);
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function successfulRequest() {
  return vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ stargazers_count: 37 }))
    .mockResolvedValueOnce(
      jsonResponse([{}], {
        headers: {
          link: '<https://api.github.com/repositories/123456/commits?per_page=1&page=84>; rel="last"',
        },
      })
    );
}

describe("server GitHub statistics adapter", () => {
  it("parses only canonical GitHub repository URLs", () => {
    expect(parseGitHubRepositoryUrl(repositoryUrl)).toEqual({
      owner: "amirrrreza1",
      name: "Portfolio",
    });
    for (const value of [
      "http://github.com/amirrrreza1/Portfolio",
      "https://github.com/amirrrreza1/Portfolio/issues",
      "https://github.com/amirrrreza1/Portfolio?tab=readme",
      "https://api.github.com/repos/amirrrreza1/Portfolio",
      "not-a-url",
    ]) {
      expect(parseGitHubRepositoryUrl(value)).toBeNull();
    }
  });

  it("never fetches a repository outside the configured owner and allowlist", async () => {
    const request = vi.fn();
    const read = createGitHubStatsReader({
      fetch: request as unknown as typeof fetch,
      cache: new TestCache(),
    });

    await expect(
      read(settings, [
        "https://github.com/other/Portfolio",
        "https://github.com/amirrrreza1/Not-Allowed",
        "https://attacker.example/amirrrreza1/Portfolio",
      ])
    ).resolves.toEqual({
      "https://github.com/other/Portfolio": null,
      "https://github.com/amirrrreza1/Not-Allowed": null,
      "https://attacker.example/amirrrreza1/Portfolio": null,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("uses fixed GitHub endpoints, optional authentication, and the TTL cache", async () => {
    const request = successfulRequest();
    let now = 1_000;
    const read = createGitHubStatsReader({
      fetch: request as unknown as typeof fetch,
      cache: new TestCache(),
      now: () => now,
      token: "server-token",
    });

    await expect(read(settings, [repositoryUrl])).resolves.toEqual({
      [repositoryUrl]: { stars: 37, commits: 84 },
    });
    expect(request).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/repos/amirrrreza1/Portfolio",
      expect.objectContaining({
        redirect: "error",
        headers: expect.objectContaining({
          authorization: "Bearer server-token",
          "user-agent": "portfolio-server-github-stats",
        }),
      })
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/amirrrreza1/Portfolio/commits?per_page=1",
      expect.any(Object)
    );

    now = 60_000;
    await expect(read(settings, [repositoryUrl])).resolves.toEqual({
      [repositoryUrl]: { stars: 37, commits: 84 },
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("serves validated stale data for at most 24 hours, then fails closed", async () => {
    const request = successfulRequest();
    const cache = new TestCache();
    const stale = vi.fn();
    const unavailable = vi.fn();
    let now = 0;
    const read = createGitHubStatsReader({
      fetch: request as unknown as typeof fetch,
      cache,
      now: () => now,
      onStale: stale,
      onUnavailable: unavailable,
    });
    await read(settings, [repositoryUrl]);
    request.mockRejectedValue(new Error("network down"));

    now = 61_000;
    await expect(read(settings, [repositoryUrl])).resolves.toEqual({
      [repositoryUrl]: { stars: 37, commits: 84 },
    });
    expect(stale).toHaveBeenCalledWith({
      repository: "amirrrreza1/portfolio",
      ageMs: 61_000,
    });

    now = 24 * 60 * 60 * 1_000 + 1;
    await expect(read(settings, [repositoryUrl])).resolves.toEqual({
      [repositoryUrl]: null,
    });
    expect(unavailable).toHaveBeenCalledWith({
      repository: "amirrrreza1/portfolio",
    });
  });

  it("negative-caches upstream failures without extending them past five minutes", async () => {
    const request = vi.fn().mockRejectedValue(new Error("not found"));
    const unavailable = vi.fn();
    let now = 1_000;
    const read = createGitHubStatsReader({
      fetch: request as unknown as typeof fetch,
      cache: new TestCache(),
      now: () => now,
      onUnavailable: unavailable,
    });

    await expect(read(settings, [repositoryUrl])).resolves.toEqual({
      [repositoryUrl]: null,
    });
    await expect(read(settings, [repositoryUrl])).resolves.toEqual({
      [repositoryUrl]: null,
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(unavailable).toHaveBeenCalledTimes(1);

    now += 60_001;
    await read(settings, [repositoryUrl]);
    expect(request).toHaveBeenCalledTimes(4);
    expect(unavailable).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed, oversized, and untrusted pagination responses", async () => {
    for (const request of [
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ stargazers_count: "many" }))
        .mockResolvedValueOnce(jsonResponse([{}])),
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            { stargazers_count: 1 },
            { headers: { "content-length": "70000" } }
          )
        )
        .mockResolvedValueOnce(jsonResponse([{}])),
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ stargazers_count: 1 }))
        .mockResolvedValueOnce(
          jsonResponse([{}], {
            headers: {
              link: '<https://attacker.example/commits?page=99>; rel="last"',
            },
          })
        ),
    ]) {
      const read = createGitHubStatsReader({
        fetch: request as unknown as typeof fetch,
        cache: new TestCache(),
      });
      await expect(read(settings, [repositoryUrl])).resolves.toEqual({
        [repositoryUrl]: null,
      });
    }
  });
});

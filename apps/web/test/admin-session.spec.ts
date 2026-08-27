import { SESSION_COOKIE_NAME } from "@portfolio/contracts/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new RedirectSignal(path);
  },
}));

class RedirectSignal extends Error {
  public constructor(public readonly path: string) {
    super(`redirect:${path}`);
  }
}

const {
  AdminApiUnavailableError,
  fetchAdminActor,
  listAdminSessions,
  requireAdminActor,
} = await import("../src/server/admin-session");

/**
 * The server half of the admin boundary.
 *
 * The property under test is narrow and load-bearing: the shell asks the API
 * on every render and believes nothing else. In particular, "the API said no"
 * and "the API could not answer" must never collapse into the same outcome —
 * the first sends the owner to a login page that will work, and the second
 * would send them to one that cannot.
 */

const ACTOR = {
  userId: "3f6b1c34-9a2e-4d51-b0f8-2c5d6e7a8b90",
  displayName: "Portfolio Owner",
  role: "OWNER",
  recentlyAuthenticated: true,
  expiresAt: "2026-08-27T18:00:00.000Z",
};

function respondWith(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () =>
      new Response(body === null ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  cookieStore.clear();
  process.env.API_INTERNAL_ORIGIN = "http://127.0.0.1:4000";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reading the admin actor", () => {
  it("answers 'signed out' without a round trip when no cookie was sent", async () => {
    const fetchMock = respondWith(200, { data: ACTOR });
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchAdminActor()).toBeNull();
    // Not merely null — *no request*. A cookieless request cannot possibly be
    // authenticated, and asking anyway would let an unauthenticated visitor
    // drive one API call per page load.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the actor the API describes", async () => {
    cookieStore.set(SESSION_COOKIE_NAME, "opaque-token");
    vi.stubGlobal("fetch", respondWith(200, { data: ACTOR }));

    const actor = await fetchAdminActor();

    expect(actor?.displayName).toBe("Portfolio Owner");
    expect(actor?.role).toBe("OWNER");
  });

  it("forwards the session cookie and never caches the answer", async () => {
    cookieStore.set(SESSION_COOKIE_NAME, "opaque-token");
    const fetchMock = respondWith(200, { data: ACTOR });
    vi.stubGlobal("fetch", fetchMock);

    await fetchAdminActor();

    const [url, init] = (
      fetchMock as unknown as { mock: { calls: [URL, RequestInit][] } }
    ).mock.calls[0]!;
    expect(url.toString()).toBe("http://127.0.0.1:4000/api/v1/auth/session");
    expect((init.headers as Record<string, string>).cookie).toContain(
      `${SESSION_COOKIE_NAME}=opaque-token`
    );
    // A per-session response in any cache is a session handed to whoever asks
    // next through the same layer.
    expect(init.cache).toBe("no-store");
  });

  it("accepts the unprefixed cookie name used over plain HTTP", async () => {
    cookieStore.set("portfolio_session", "opaque-token");
    const fetchMock = respondWith(200, { data: ACTOR });
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchAdminActor()).not.toBeNull();
  });

  it("treats a refusal as signed out", async () => {
    cookieStore.set(SESSION_COOKIE_NAME, "expired-or-revoked");
    for (const status of [401, 403]) {
      vi.stubGlobal("fetch", respondWith(status, { error: { code: "X" } }));
      expect(await fetchAdminActor(), String(status)).toBeNull();
    }
  });

  it("throws rather than reporting an outage as a signed-out visitor", async () => {
    cookieStore.set(SESSION_COOKIE_NAME, "opaque-token");
    vi.stubGlobal("fetch", respondWith(503, { error: { code: "X" } }));

    await expect(fetchAdminActor()).rejects.toBeInstanceOf(
      AdminApiUnavailableError
    );
  });

  it("throws when the API answers something that is not a session actor", async () => {
    // A 200 carrying the wrong shape is not a session. Accepting it would let
    // a misrouted upstream — or a captive portal — stand in for the API.
    cookieStore.set(SESSION_COOKIE_NAME, "opaque-token");
    vi.stubGlobal("fetch", respondWith(200, { data: { role: "OWNER" } }));

    await expect(fetchAdminActor()).rejects.toBeInstanceOf(
      AdminApiUnavailableError
    );
  });

  it("refuses to guess an API origin", async () => {
    // Falling back to localhost would answer "not signed in" in production for
    // a reason no log explains.
    cookieStore.set(SESSION_COOKIE_NAME, "opaque-token");
    delete process.env.API_INTERNAL_ORIGIN;
    vi.stubGlobal("fetch", respondWith(200, { data: ACTOR }));

    await expect(fetchAdminActor()).rejects.toThrow(/API_INTERNAL_ORIGIN/);
  });
});

describe("the guard", () => {
  it("redirects to the login page when there is no session", async () => {
    vi.stubGlobal("fetch", respondWith(200, { data: ACTOR }));

    await expect(requireAdminActor()).rejects.toMatchObject({
      path: "/admin/login",
    });
  });

  it("lets an outage surface instead of redirecting to a login that cannot help", async () => {
    cookieStore.set(SESSION_COOKIE_NAME, "opaque-token");
    vi.stubGlobal("fetch", respondWith(500, { error: { code: "X" } }));

    await expect(requireAdminActor()).rejects.toBeInstanceOf(
      AdminApiUnavailableError
    );
  });
});

describe("the session list", () => {
  it("returns an empty list rather than throwing when signed out", async () => {
    vi.stubGlobal("fetch", respondWith(200, { data: [] }));

    expect(await listAdminSessions()).toEqual([]);
  });

  it("parses the summaries the API returns", async () => {
    cookieStore.set(SESSION_COOKIE_NAME, "opaque-token");
    vi.stubGlobal(
      "fetch",
      respondWith(200, {
        data: [
          {
            id: "9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
            client: "Firefox on Windows",
            createdAt: "2026-08-27T09:00:00.000Z",
            lastSeenAt: "2026-08-27T09:30:00.000Z",
            expiresAt: "2026-08-27T21:00:00.000Z",
            current: true,
          },
        ],
      })
    );

    const sessions = await listAdminSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.client).toBe("Firefox on Windows");
    // The contract carries no token, no IP, and no raw user-agent. This
    // assertion is what would fail if one were ever added to the summary.
    expect(Object.keys(sessions[0] ?? {}).sort()).toEqual([
      "client",
      "createdAt",
      "current",
      "expiresAt",
      "id",
      "lastSeenAt",
    ]);
  });
});

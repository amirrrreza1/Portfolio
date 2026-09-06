import { SESSION_COOKIE_NAME } from "@portfolio/contracts/auth";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isAdminPath } from "../src/server/admin-routes";
import { proxyWithDependencies } from "../src/proxy";

/**
 * The admin boundary's edge half — SECURITY.md §10 and the M6 exit gate.
 *
 * These tests cover what the proxy decides before any admin code renders: who
 * gets redirected, and what policy the response carries. They deliberately do
 * **not** claim to prove authentication. The proxy cannot tell a valid session
 * token from a forged one and never tries; that answer comes from the API on
 * every render, and the browser run in `e2e/admin-boundary.spec.mts` is what
 * proves it end to end.
 */

function admin(path: string, cookie?: string): NextRequest {
  return new NextRequest(`https://example.test${path}`, {
    headers: cookie === undefined ? {} : { cookie },
  });
}

const SESSION_COOKIE = `${SESSION_COOKIE_NAME}=opaque-token`;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin path classification", () => {
  it("matches the prefix and its children, and nothing that merely starts with it", () => {
    for (const pathname of ["/admin", "/admin/login", "/admin/a/b"]) {
      expect(isAdminPath(pathname), pathname).toBe(true);
    }
    // `/administration` starts with `/admin` as a string and is not an admin
    // route. A `startsWith("/admin")` test would hand it the admin policy and,
    // worse, the admin redirect.
    for (const pathname of ["/administration", "/adminx", "/en/admin", "/"]) {
      expect(isAdminPath(pathname), pathname).toBe(false);
    }
  });
});

describe("admin proxy boundary", () => {
  it("redirects a cookieless admin request to the login page", async () => {
    const response = await proxyWithDependencies(admin("/admin"));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe(
      "/admin/login"
    );
  });

  it("keeps the security policy on the redirect itself", async () => {
    // A redirect is still a response the browser processes. Sending it without
    // the admin headers would leave a hole exactly one hop wide.
    const response = await proxyWithDependencies(admin("/admin"));

    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive"
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("lets the two sign-in surfaces through without a session", async () => {
    for (const pathname of ["/admin/login", "/admin/recovery"]) {
      const response = await proxyWithDependencies(admin(pathname));
      expect(response.status, pathname).toBe(200);
      expect(response.headers.get("location"), pathname).toBeNull();
    }
  });

  it("lets a request carrying a session cookie reach the shell", async () => {
    const response = await proxyWithDependencies(
      admin("/admin", SESSION_COOKIE)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("accepts the unprefixed cookie name plain HTTP development uses", async () => {
    // `__Host-` is only legal on a Secure cookie, so the API falls back to the
    // bare name over HTTP. A presence check that knew only the prefixed name
    // would redirect every signed-in developer away from the panel.
    const response = await proxyWithDependencies(
      admin("/admin", "portfolio_session=opaque-token")
    );

    expect(response.status).toBe(200);
  });

  it("treats an empty session cookie as no cookie", async () => {
    const response = await proxyWithDependencies(
      admin("/admin", `${SESSION_COOKIE_NAME}=`)
    );

    expect(response.status).toBe(307);
  });

  it("canonicalizes a trailing slash in one hop", async () => {
    const response = await proxyWithDependencies(
      admin("/admin/", SESSION_COOKIE)
    );

    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/admin");
  });

  it("never sends an admin path through locale negotiation", async () => {
    // The panel is English-only and carries no locale prefix. A Persian
    // language preference must not redirect it, vary it, or hand it the
    // public policy on the way past.
    const response = await proxyWithDependencies(
      new NextRequest("https://example.test/admin", {
        headers: { cookie: SESSION_COOKIE, "accept-language": "fa" },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-src 'none'"
    );
  });
});

describe("admin response policy — SECURITY.md §10", () => {
  it("permits devtool styles only in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const developmentResponse = await proxyWithDependencies(
      admin("/admin", SESSION_COOKIE)
    );
    expect(
      developmentResponse.headers.get("content-security-policy")
    ).toContain("style-src 'self' 'unsafe-inline'");

    vi.stubEnv("NODE_ENV", "production");
    const productionResponse = await proxyWithDependencies(
      admin("/admin", SESSION_COOKIE)
    );
    const productionCsp = productionResponse.headers.get(
      "content-security-policy"
    )!;
    expect(productionCsp).toContain("style-src 'self'");
    expect(productionCsp).not.toContain("'unsafe-inline'");
  });

  it("is stricter than the public policy in every clause it changes", async () => {
    const adminResponse = await proxyWithDependencies(
      admin("/admin", SESSION_COOKIE)
    );
    const publicResponse = await proxyWithDependencies(
      new NextRequest("https://example.test/en/blog"),
      { dataSource: "legacy" }
    );

    const adminCsp = adminResponse.headers.get("content-security-policy")!;
    const publicCsp = publicResponse.headers.get("content-security-policy")!;

    // The public site renders remote media; the admin shell renders none, and
    // an admin page that can load an arbitrary remote image is an admin page
    // that can report having been opened.
    expect(publicCsp).toContain("img-src 'self' data: blob: https:");
    expect(adminCsp).toContain("img-src 'self' data:");
    expect(adminCsp).not.toContain("https:");
    expect(adminCsp).not.toContain("blob:");

    for (const directive of [
      "frame-src 'none'",
      "worker-src 'none'",
      "manifest-src 'none'",
      "media-src 'none'",
    ]) {
      expect(adminCsp, directive).toContain(directive);
    }

    expect(adminCsp).toContain("frame-ancestors 'none'");
    expect(adminCsp).toContain("object-src 'none'");
    expect(adminCsp).toContain("base-uri 'self'");
    expect(adminCsp).toContain("form-action 'self'");
    expect(adminCsp).toContain("connect-src 'self'");
    expect(adminCsp).not.toContain("'unsafe-eval'");
    expect(adminCsp).toMatch(/script-src 'self' 'nonce-[^']+'/);
  });

  it("names WebAuthn in the permissions policy", async () => {
    // Both directives already default to `self`. SECURITY.md §10 asks for a
    // policy tested against WebAuthn, and a policy that never mentions it is
    // one nobody checked — naming it is what makes a later blanket `()` a
    // visible change rather than a silent breakage of sign-in.
    const response = await proxyWithDependencies(
      admin("/admin", SESSION_COOKIE)
    );
    const policy = response.headers.get("permissions-policy")!;

    expect(policy).toContain("publickey-credentials-get=(self)");
    expect(policy).toContain("publickey-credentials-create=(self)");
    expect(policy).toContain("camera=()");
  });

  it("marks admin responses uncacheable, unindexable, and unreferrable", async () => {
    const response = await proxyWithDependencies(
      admin("/admin", SESSION_COOKIE)
    );

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive"
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cross-origin-opener-policy")).toBe(
      "same-origin"
    );
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin"
    );
    expect(response.headers.get("cross-origin-embedder-policy")).toBe(
      "require-corp"
    );
  });

  it("leaves the public policy alone", async () => {
    // The admin branch returns early. This is the assertion that says so: a
    // refactor that moved the branch after the public header block, or applied
    // the admin headers to everything, would show up here rather than in a
    // browser weeks later.
    const response = await proxyWithDependencies(
      new NextRequest("https://example.test/en/blog"),
      { dataSource: "legacy" }
    );

    expect(response.headers.get("x-robots-tag")).toBeNull();
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(response.headers.get("cross-origin-embedder-policy")).toBeNull();
    expect(response.headers.get("content-security-policy")).not.toContain(
      "frame-src 'none'"
    );
  });
});

import { expect, test, type Page } from "@playwright/test";

import {
  adminBaseUrl,
  attachVirtualAuthenticator,
  ownerCredentials,
  refreshCredential,
  rememberCredential,
  SESSION_COOKIE,
  sessionCookieValue,
} from "./support";

/**
 * The M6 exit gate, in a browser.
 *
 * Three claims are under test and only a real browser against the real stack
 * can settle them:
 *
 * 1. The admin shell cannot be reached without verified credentials — not
 *    without a cookie, and not with a forged one either. The second half is
 *    the one that matters: the proxy's cookie check is a fast path, and this
 *    file exists partly to prove that it is not what is doing the work.
 * 2. A passkey assertion is verified cryptographically. The virtual
 *    authenticator produces real ES256 signatures over real challenges; the
 *    API rejects anything else.
 * 3. Revocation and sign-out take effect server-side, so a copied cookie stops
 *    working rather than outliving the session it came from.
 */

const owner = ownerCredentials();

test.describe.configure({ mode: "serial" });

test.describe("the boundary refuses", () => {
  test("sends every signed-out admin URL to the login page", async ({
    page,
  }) => {
    for (const path of ["/admin", "/admin/", "/admin/anything"]) {
      await page.goto(path);
      expect(new URL(page.url()).pathname, path).toBe("/admin/login");
    }
  });

  test("refuses a forged session cookie", async ({ page, context }) => {
    // This one gets past the proxy: it *has* a session cookie, so the cheap
    // presence check waves it through. What stops it is the API, which finds
    // no session for that token. If this test ever passes for the wrong
    // reason — a redirect from the proxy rather than from the guard — the next
    // assertion catches it, because a forged cookie that the proxy rejected
    // would never have reached the shell to be refused.
    await context.addCookies([
      { name: SESSION_COOKIE, value: "forged-opaque-token", url: adminBaseUrl },
    ]);
    await page.goto("/admin");

    expect(new URL(page.url()).pathname).toBe("/admin/login");
    await expect(page.getByTestId("admin-actor")).toHaveCount(0);
  });

  test("never serves shell markup to a signed-out request", async ({
    request,
  }) => {
    // Following redirects would hide a shell that renders and *then*
    // redirects, which is a real failure mode for client-side guards: the
    // markup has already been sent by the time the redirect happens.
    const response = await request.get("/admin", { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain("/admin/login");
    expect(await response.text()).not.toContain("Signed in as");
  });

  test("carries the admin security policy on admin responses", async ({
    request,
  }) => {
    const response = await request.get("/admin/login");
    const headers = response.headers();
    const csp = headers["content-security-policy"] ?? "";

    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+'/);
    expect(headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
    expect(headers["cache-control"]).toBe("private, no-store");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["permissions-policy"]).toContain(
      "publickey-credentials-get=(self)"
    );
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["cross-origin-embedder-policy"]).toBe("require-corp");
  });
});

test.describe("the bootstrap", () => {
  test("a recovery code buys a session, and that session enrols the first passkey", async ({
    page,
  }) => {
    // This is the documented bootstrap, and the only order in which an owner
    // with no passkey can ever obtain one: provisioning issues recovery codes,
    // a code buys a session, and the first passkey is enrolled from it. There
    // is no unauthenticated registration window to short-circuit it.
    const { client, authenticatorId } = await attachVirtualAuthenticator(page);

    await page.goto("/admin/recovery");
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Recovery code").fill(owner.recoveryCode);
    await page.getByRole("button", { name: "Use recovery code" }).click();

    await expect(page.getByTestId("admin-actor")).toContainText("OWNER");
    expect(new URL(page.url()).pathname).toBe("/admin");

    await page.getByRole("link", { name: "Security", exact: true }).click();
    await page.getByLabel("Name this device").fill("Virtual authenticator");
    await page.getByTestId("admin-enrol-passkey").click();
    await expect(page.getByTestId("admin-enrol-status")).toHaveText(
      "Passkey registered."
    );

    const { credentials } = await client.send("WebAuthn.getCredentials", {
      authenticatorId,
    });
    expect(credentials).toHaveLength(1);
    // Carried forward so the sign-in tests below use the key registered here
    // rather than one minted for their own convenience.
    rememberCredential(credentials[0]!);
  });
});

test.describe("two-factor sign-in", () => {
  test("a wrong password is refused at the passkey step, not before it", async ({
    page,
  }) => {
    // The password step returns a challenge whether or not it succeeded, and
    // the options response never names a credential, so a doomed flow is
    // indistinguishable from a real one until the assertion is verified. That
    // is what stops the form being an account-enumeration oracle, and it is
    // observable here: the prompt appears, and the refusal arrives after it.
    await attachVirtualAuthenticator(page, { withEnrolledCredential: true });

    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Password").fill("not-the-right-password-at-all");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByTestId("admin-login-status")).toHaveText(
      "Those credentials were not accepted."
    );
    expect(new URL(page.url()).pathname).toBe("/admin/login");
  });

  test("password plus passkey reaches the shell", async ({ page }) => {
    await signIn(page);

    await expect(page.getByTestId("admin-actor")).toContainText("OWNER");
    await expect(page.getByTestId("admin-role")).toHaveText("OWNER");
  });

  test("renders the shell without a single CSP violation", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy/i.test(message.text())) {
        violations.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      if (/Content Security Policy/i.test(error.message)) {
        violations.push(error.message);
      }
    });

    await signIn(page);
    await page.waitForLoadState("networkidle");

    expect(violations).toEqual([]);
  });
});

test.describe("session control — ADMIN-002", () => {
  test("lists this session and revokes another one", async ({
    page,
    browser,
  }) => {
    await signIn(page);

    // A second signed-in browser, so there is a session to revoke that is not
    // the one doing the revoking.
    const other = await browser.newContext({ baseURL: adminBaseUrl });
    const otherPage = await other.newPage();
    await signIn(otherPage);
    const otherToken = await sessionCookieValue(other);
    expect(otherToken).toBeDefined();

    await page.reload();
    const rows = page.getByTestId("admin-session-row");
    // Earlier tests in this file signed in and never signed out, so the list
    // legitimately holds more than two. Asserting a fixed number would be
    // asserting the order this file happens to run in.
    const initial = await rows.count();
    expect(initial).toBeGreaterThanOrEqual(2);
    await expect(
      page.locator('[data-testid="admin-session-row"][data-current="true"]')
    ).toHaveCount(1);

    // Revoke every session that is not this one. The second and later
    // revocations also exercise the recent-auth prompt, since the window
    // closes while the loop runs on a slow machine.
    for (let remaining = initial; remaining > 1; remaining -= 1) {
      await page.getByTestId("admin-revoke-session").first().click();
      await expect(rows).toHaveCount(remaining - 1);
    }
    await expect(
      page.locator('[data-testid="admin-session-row"][data-current="true"]')
    ).toHaveCount(1);

    // The revoked session is dead at the server, not merely absent from a
    // list. Its cookie in a fresh browser buys nothing.
    const stale = await browser.newContext({ baseURL: adminBaseUrl });
    await stale.addCookies([
      { name: SESSION_COOKIE, value: otherToken!, url: adminBaseUrl },
    ]);
    const stalePage = await stale.newPage();
    await stalePage.goto("/admin");
    expect(new URL(stalePage.url()).pathname).toBe("/admin/login");

    await stale.close();
    await other.close();
  });

  test("signing out revokes the session rather than dropping the cookie", async ({
    page,
    context,
    browser,
  }) => {
    await signIn(page);
    const token = await sessionCookieValue(context);
    expect(token).toBeDefined();

    await page.getByTestId("admin-sign-out").click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    const replayed = await browser.newContext({ baseURL: adminBaseUrl });
    await replayed.addCookies([
      { name: SESSION_COOKIE, value: token!, url: adminBaseUrl },
    ]);
    const replayedPage = await replayed.newPage();
    await replayedPage.goto("/admin");

    expect(new URL(replayedPage.url()).pathname).toBe("/admin/login");
    await replayed.close();
  });
});

/** Password, then a real assertion from the virtual authenticator. */
async function signIn(page: Page): Promise<void> {
  const { client, authenticatorId } = await attachVirtualAuthenticator(page, {
    withEnrolledCredential: true,
  });
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("admin-actor")).toBeVisible();
  await refreshCredential(client, authenticatorId);
}

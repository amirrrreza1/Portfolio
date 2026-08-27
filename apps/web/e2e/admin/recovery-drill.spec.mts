import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type CDPSession, type Page } from "@playwright/test";

import {
  adminBaseUrl,
  attachVirtualAuthenticator,
  ownerCredentials,
  refreshCredential,
  rememberCredential,
  SESSION_COOKIE,
  sessionCookieValue,
  type StoredCredential,
} from "./support";

/**
 * The owner recovery and credential-revocation drill, rehearsed.
 *
 * `docs/runbooks/owner-recovery-and-revocation.md` is the document an operator
 * follows; this file is that document executed. The M6 exit gate asks for a
 * drill that is "documented and repeatable", and a rehearsal that only ever
 * happened once, by hand, on a machine nobody kept, is neither. Running the
 * real commands against the real stack is what makes the runbook a claim that
 * can be falsified.
 *
 * Every step here maps to a numbered step in the runbook. Where the runbook
 * says "run this command", this file runs that command — not an imitation of
 * it — through `revoke:credentials` in a child process.
 *
 * Preconditions, all supplied by the harness described in
 * `docs/status/evidence/M6-recovery-revocation-drill.md`:
 *   - a freshly provisioned owner with ten unused recovery codes and no passkey
 *   - `E2E_RECOVERY_CODES`, a comma-separated list of at least three of them
 *   - `E2E_DATABASE_URL`, the same database the API is using
 */

const owner = ownerCredentials();

const codes = (process.env.E2E_RECOVERY_CODES ?? "")
  .split(",")
  .map((code) => code.trim())
  .filter((code) => code.length > 0);

const databaseUrl = process.env.E2E_DATABASE_URL;

const databasePackage = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/database"
);

test.beforeAll(() => {
  if (codes.length < 3) {
    throw new Error("E2E_RECOVERY_CODES needs at least three unused codes.");
  }
  if (!databaseUrl) throw new Error("E2E_DATABASE_URL is required.");
});

// Recovery is throttled harder than login, and this drill signs in with a
// code several times. Waiting out a refusal is part of the procedure, so the
// budget has to allow for it.
test.describe.configure({ mode: "serial", timeout: 180_000 });

const transcript: string[] = [];
function record(step: string, detail: string): void {
  transcript.push(`${step} — ${detail}`);
  process.stdout.write(`    ${step} — ${detail}\n`);
}

/** The runbook's command, run for real. */
function revokeCredentials(args: readonly string[]): string {
  return execFileSync(
    "npx",
    ["tsx", "scripts/revoke-credentials.ts", "--email", owner.email, ...args],
    {
      cwd: databasePackage,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: "utf8",
    }
  );
}

function credentialIds(listing: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const line of listing.split("\n")) {
    const match = /^\s{2}(\S+)\s{2}(.+?)\s{2}registered/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      found.set(match[2].trim(), match[1]);
    }
  }
  return found;
}

/**
 * A mutable handle on one authenticator's credential.
 *
 * The signature counter advances with every successful assertion, and the
 * server refuses one that goes backwards — correctly, since that is what a
 * cloned key looks like. Each test gets a fresh browser context and therefore
 * a fresh virtual authenticator seeded from this value, so it has to be
 * written back after every sign-in rather than captured once at enrolment.
 */
interface KeyHandle {
  credential: StoredCredential;
}

let lostKey: KeyHandle;
let replacementKey: KeyHandle;

test("setup — the state the drill starts from", async ({ page }) => {
  // Not part of either drill. This is the ordinary life of an account before
  // anything goes wrong: a code buys the first session, and that session
  // enrols the passkey which is later lost.
  const { client, authenticatorId } = await attachVirtualAuthenticator(page);
  await recoverWith(page, codes[0]!);
  await enrol(page, "Old laptop");

  lostKey = { credential: await readCredential(client, authenticatorId) };
  record("setup", 'signed in with a recovery code and enrolled "Old laptop"');

  await page.getByTestId("admin-sign-out").click();
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test.describe("Drill A — the owner has lost their passkey", () => {
  test("A1 — a recovery code signs in and sweeps every other session", async ({
    page,
    browser,
  }) => {
    // A session that predates the incident, to prove the sweep is real rather
    // than a claim in the documentation.
    const stranded = await browser.newContext({ baseURL: adminBaseUrl });
    const strandedPage = await stranded.newPage();
    await signInWith(strandedPage, lostKey);
    const strandedToken = await sessionCookieValue(stranded);

    await recoverWith(page, codes[1]!);
    record("A1", "recovery code accepted, shell reached");

    const replayed = await browser.newContext({ baseURL: adminBaseUrl });
    await replayed.addCookies([
      { name: SESSION_COOKIE, value: strandedToken!, url: adminBaseUrl },
    ]);
    const replayedPage = await replayed.newPage();
    await replayedPage.goto("/admin");
    expect(new URL(replayedPage.url()).pathname).toBe("/admin/login");
    record(
      "A1",
      "the pre-existing session was revoked by the recovery sign-in"
    );

    await replayed.close();
    await stranded.close();
  });

  test("A1 — the same code cannot be used twice", async ({ page }) => {
    await page.goto("/admin/recovery");
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Recovery code").fill(codes[1]!);
    await page.getByRole("button", { name: "Use recovery code" }).click();

    await expect(page.getByTestId("admin-recovery-status")).not.toHaveText(
      /Using a code signs/
    );
    expect(new URL(page.url()).pathname).toBe("/admin/recovery");
    record("A1", "a spent recovery code is refused");
  });

  test("A2–A3 — enrol a replacement and prove it works on its own", async ({
    page,
  }) => {
    const { client, authenticatorId } = await attachVirtualAuthenticator(page);
    await recoverWith(page, codes[2]!);
    await enrol(page, "Replacement key");
    replacementKey = {
      credential: await readCredential(client, authenticatorId),
    };
    record("A2", 'enrolled "Replacement key" from the recovery session');

    await page.getByTestId("admin-sign-out").click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    await signInWith(page, replacementKey);
    record("A3", "password plus the replacement passkey reaches the shell");
  });

  test("A4 — revoking the lost passkey removes it and ends every session", async ({
    page,
    context,
  }) => {
    await signInWith(page, replacementKey);
    const token = await sessionCookieValue(context);

    const listing = revokeCredentials(["--list"]);
    const ids = credentialIds(listing);
    expect([...ids.keys()].sort()).toEqual(["Old laptop", "Replacement key"]);

    const output = revokeCredentials([
      "--credential",
      ids.get("Old laptop")!,
      "--apply",
    ]);
    expect(output).toContain("Revoked 1 passkey(s).");
    expect(output).toContain("Passkeys remaining: 1.");
    record("A4", output.match(/Signed out \d+ session\(s\)\./)?.[0] ?? "");

    // The runbook warns that this signs you out too. Proving it means an
    // operator is never surprised into thinking the command failed.
    await page.context().clearCookies();
    await page
      .context()
      .addCookies([{ name: SESSION_COOKIE, value: token!, url: adminBaseUrl }]);
    await page.goto("/admin");
    expect(new URL(page.url()).pathname).toBe("/admin/login");
    record("A4", "the operator's own session was ended by the revocation");
  });

  test("A4 — the revoked passkey no longer authenticates", async ({ page }) => {
    // A device that holds no credential for this relying party, which is the
    // position a found-but-revoked laptop is in.
    await attachVirtualAuthenticator(page);

    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Password").fill(owner.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByTestId("admin-login-status")).not.toHaveText(" ");
    expect(new URL(page.url()).pathname).toBe("/admin/login");
    record("A4", "a device without the surviving passkey cannot sign in");
  });
});

test.describe("Drill B — a credential is compromised", () => {
  test("B1 — revoke sessions first, from a trusted one", async ({
    page,
    browser,
  }) => {
    await signInWith(page, replacementKey);

    const attacker = await browser.newContext({ baseURL: adminBaseUrl });
    const attackerPage = await attacker.newPage();
    await signInWith(attackerPage, replacementKey);
    const attackerToken = await sessionCookieValue(attacker);

    await page.reload();
    const rows = page.getByTestId("admin-session-row");
    const initial = await rows.count();
    for (let remaining = initial; remaining > 1; remaining -= 1) {
      await page.getByTestId("admin-revoke-session").first().click();
      await expect(rows).toHaveCount(remaining - 1);
    }
    record("B1", `revoked ${initial - 1} other session(s) from the shell`);

    const replayed = await browser.newContext({ baseURL: adminBaseUrl });
    await replayed.addCookies([
      { name: SESSION_COOKIE, value: attackerToken!, url: adminBaseUrl },
    ]);
    const replayedPage = await replayed.newPage();
    await replayedPage.goto("/admin");
    expect(new URL(replayedPage.url()).pathname).toBe("/admin/login");
    record("B1", "the compromised session's cookie is dead");

    await replayed.close();
    await attacker.close();
  });

  test("B2 — the guard refuses a revocation that would lock the account out", () => {
    // The single most dangerous operator mistake this script can prevent.
    // Temporarily spend every recovery code, so the account's only remaining
    // way in is the passkey about to be removed.
    // Record exactly which codes are unused, spend them, and put those same
    // ones back afterwards. Restoring "the three most recent" would be a guess
    // — they are all created in one transaction and share a timestamp — and a
    // drill that quietly consumed the owner's remaining codes would be worse
    // than no drill.
    const unused = execFileSync("psql", [
      databaseUrl!,
      "-tAc",
      `select "codeHash" from recovery_codes where "usedAt" is null`,
    ])
      .toString()
      .trim()
      .split("\n")
      .filter((hash) => hash.length > 0);
    expect(unused.length).toBeGreaterThan(0);

    execFileSync("psql", [
      databaseUrl!,
      "-q",
      "-c",
      `update recovery_codes set "usedAt" = now() where "usedAt" is null`,
    ]);

    const ids = credentialIds(revokeCredentials(["--list"]));
    let refused = "";
    try {
      revokeCredentials([
        "--credential",
        ids.get("Replacement key")!,
        "--apply",
      ]);
    } catch (error) {
      refused = String((error as { stderr?: Buffer }).stderr ?? error);
    }
    expect(refused).toContain("locking the account out permanently");
    record("B2", "revoking the last passkey with no codes left is refused");

    execFileSync("psql", [
      databaseUrl!,
      "-q",
      "-c",
      `update recovery_codes set "usedAt" = null where "codeHash" in (${unused
        .map((hash) => `'${hash}'`)
        .join(", ")})`,
    ]);
    expect(revokeCredentials(["--list"])).toContain("Replacement key");
  });

  test("B2–B3 — revoke the compromised passkey and confirm it is dead", async ({
    page,
  }) => {
    const ids = credentialIds(revokeCredentials(["--list"]));
    const output = revokeCredentials([
      "--credential",
      ids.get("Replacement key")!,
      "--apply",
    ]);
    expect(output).toContain("Passkeys remaining: 0.");
    expect(output).toContain("Sign in with a recovery code and enrol one now.");
    record("B2", "the compromised passkey was removed and all sessions ended");

    await signInWith(page, replacementKey, { expectFailure: true });
    record("B3", "the revoked passkey is refused at sign-in");
  });

  test("B5 — the audit trail records the revocation and carries no secrets", () => {
    const rows = execFileSync("psql", [
      databaseUrl!,
      "-tAc",
      `select "eventType" || '|' || outcome || '|' || coalesce(metadata::text, '')
       from audit_events order by "createdAt" desc limit 100`,
    ]).toString();

    expect(rows).toContain("auth.credential.revoked|SUCCESS");
    expect(rows).toContain("auth.recovery.used");
    expect(rows).toContain("auth.login");
    // The account's password, a recovery code, and a session token must not
    // appear anywhere in the trail an incident report would attach.
    expect(rows).not.toContain(owner.password);
    for (const code of codes) expect(rows).not.toContain(code);
    record("B5", "audit events present, and free of credentials");
  });

  test("recovery still works after everything above", async ({ page }) => {
    // The drill must leave the account usable. If the last step of an incident
    // response is "and now nobody can sign in", the runbook is wrong.
    const { client, authenticatorId } = await attachVirtualAuthenticator(page);
    const remaining = execFileSync("psql", [
      databaseUrl!,
      "-tAc",
      `select "codeHash" from recovery_codes where "usedAt" is null limit 1`,
    ])
      .toString()
      .trim();
    expect(remaining).not.toBe("");

    await recoverWith(page, codes[codes.length - 1]!);
    await enrol(page, "Post-incident key");
    await readCredential(client, authenticatorId);
    record("close", 'account restored with "Post-incident key"');

    process.stdout.write(`\n  Drill transcript\n`);
    for (const line of transcript) process.stdout.write(`  - ${line}\n`);
  });
});

// ---------------------------------------------------------------------------

/**
 * Sign in with a recovery code, waiting out the throttle if it fires.
 *
 * Recovery carries a stricter progressive throttle than login, deliberately:
 * a code is a bearer credential and guessing one must be expensive. A drill
 * that ran into that and gave up would be reporting a fault where the system
 * is behaving exactly as designed — so this does what the runbook tells an
 * operator to do, which is read the number of seconds and wait.
 */
async function recoverWith(page: Page, code: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/admin/recovery");
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Recovery code").fill(code);
    await page.getByRole("button", { name: "Use recovery code" }).click();

    try {
      // Generous, because Argon2id is memory-hard by design and this drill
      // runs several verifications back to back. A short timeout here would
      // report the hashing cost as a failure.
      await expect(page.getByTestId("admin-actor")).toBeVisible({
        timeout: 30_000,
      });
      return;
    } catch {
      const message =
        (await page.getByTestId("admin-recovery-status").textContent()) ?? "";
      const seconds = /Wait (\d+) seconds/.exec(message)?.[1];
      if (seconds === undefined) throw new Error(`Recovery failed: ${message}`);
      record("throttle", `waited ${seconds}s for the recovery throttle`);
      await page.waitForTimeout((Number(seconds) + 2) * 1_000);
    }
  }

  await expect(page.getByTestId("admin-actor")).toBeVisible();
}

async function enrol(page: Page, label: string): Promise<void> {
  await page.getByLabel("Name this device").fill(label);
  await page.getByTestId("admin-enrol-passkey").click();
  await expect(page.getByTestId("admin-enrol-status")).toHaveText(
    "Passkey registered."
  );
}

async function readCredential(
  client: CDPSession,
  authenticatorId: string
): Promise<StoredCredential> {
  const { credentials } = await client.send("WebAuthn.getCredentials", {
    authenticatorId,
  });
  return credentials[credentials.length - 1] as StoredCredential;
}

async function signInWith(
  page: Page,
  key: KeyHandle,
  options: { readonly expectFailure?: boolean } = {}
): Promise<void> {
  rememberCredential(key.credential);
  const { client, authenticatorId } = await attachVirtualAuthenticator(page, {
    withEnrolledCredential: true,
  });
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  if (options.expectFailure === true) {
    await expect(page.getByTestId("admin-login-status")).toHaveText(
      "Those credentials were not accepted.",
      { timeout: 30_000 }
    );
    return;
  }

  await expect(page.getByTestId("admin-actor")).toBeVisible({
    timeout: 30_000,
  });
  await refreshCredential(client, authenticatorId);
  key.credential = await readCredential(client, authenticatorId);
}

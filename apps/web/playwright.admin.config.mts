import { defineConfig, devices } from "@playwright/test";

/**
 * The admin boundary, in a real browser, against the real stack.
 *
 * This config deliberately starts **no** servers. The other Playwright project
 * runs the public site against a fixture API, which is right for appearance
 * work and useless here: the whole claim under test is that a session is
 * verified cryptographically by the API against a real PostgreSQL row, and a
 * fixture that agrees with the client proves nothing about either.
 *
 * So the stack is stood up first — PostgreSQL, migrations, a provisioned
 * owner, the API, and a production build of the web app — and this run is
 * pointed at it. `docs/status/evidence/M6-admin-shell-live.md` records the
 * exact commands; the four environment variables below are what connect this
 * config to that stack.
 *
 *   E2E_ADMIN_BASE_URL   the web origin, which must equal WEBAUTHN_ORIGIN
 *   E2E_OWNER_EMAIL      the provisioned owner
 *   E2E_OWNER_PASSWORD   that owner's password
 *   E2E_RECOVERY_CODE    one unused recovery code from provisioning
 *
 * Workers are pinned to one. The specs sign the same single owner account in
 * and out, revoke its sessions, and spend a single-use recovery code; two of
 * them in parallel would be racing over one row.
 */

import { adminBaseUrl } from "./e2e/admin/support";

export default defineConfig({
  testDir: "./e2e/admin",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: adminBaseUrl,
    trace: "on-first-retry",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

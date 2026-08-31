import { defineConfig, devices } from "@playwright/test";

/**
 * The browser half of the THEMING.md §9 test list.
 *
 * Everything in `test/` is a static or unit check: it can prove that the
 * stylesheet agrees with the token contract, that a cookie resolves to the
 * right values, and that no source file names a raw colour. It cannot prove
 * that the first byte already carries the right attribute, that hydration does
 * not correct it, that a blog preference stays inside the reading surface, that
 * a non-blog route requests no optional font, or that the page is still correct
 * with JavaScript switched off. Those need a rendered page, which is what this
 * project is for.
 *
 * It runs against `next build` + `next start`, not `next dev`. The CSP the
 * middleware sends differs between the two — development adds `'unsafe-eval'`
 * so Turbopack can work — and a security-header assertion against the
 * development policy would prove the wrong thing.
 */

import { API_PORT, fixtureApiOrigin, WEB_PORT, webOrigin } from "./e2e/config";

export default defineConfig({
  testDir: "./e2e",
  // The authenticated suites use their own real-stack config and credentials.
  // Never collect them while running the public fixture-backed project.
  testIgnore: "**/admin/**",
  // Appearance is a per-visitor cookie and the fixture API carries one global
  // failure switch, so parallel workers would race each other's state.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: webOrigin,
    trace: "on-first-retry",
    launchOptions: {
      // Sandboxes and Nix-like images often ship a browser that does not match
      // the pinned Playwright revision. Unset everywhere else, in which case
      // Playwright resolves its own download as usual.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: [
    {
      command: `node --experimental-strip-types e2e/fixtures/public-api-server.mts`,
      url: `${fixtureApiOrigin}/__fixture/requests`,
      env: { FIXTURE_API_PORT: String(API_PORT) },
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    },
    {
      command: `pnpm exec next build && pnpm exec next start --port ${WEB_PORT}`,
      url: `${webOrigin}/en`,
      env: {
        // The database path is the one the public routes actually use; the
        // legacy path has no articles at all, so it cannot exercise §4 or §9.
        PORTFOLIO_DATA_SOURCE: "database",
        API_INTERNAL_ORIGIN: fixtureApiOrigin,
        PUBLIC_SITE_URL: webOrigin,
        BIRTH_DATE: "2000-01-01",
        NODE_ENV: "production",
      },
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 300_000,
    },
  ],
});

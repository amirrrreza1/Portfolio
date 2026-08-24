import { defineConfig } from "vitest/config";

/**
 * Node-environment tests only.
 *
 * These suites cover pure logic, contract agreement, and repository asset
 * integrity, so they need no DOM. The design-system boundary's browser half —
 * first paint, hydration, computed style, the requests a page actually issues,
 * and behaviour with JavaScript off — is a real browser's job and lives in
 * `e2e/` under Playwright (`pnpm test:e2e`), not in a simulated DOM here.
 * `include` keeps the two apart: `e2e/**` is never collected by vitest.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
  },
});

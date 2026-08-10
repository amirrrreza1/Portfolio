import { defineConfig } from "vitest/config";

/**
 * Contracts are pure validation logic with no I/O, so the tests need no DOM,
 * no database, and no network. Keeping it that way is deliberate: this package
 * is imported by browser code, and a test that needed a server dependency would
 * be the first sign that boundary had been crossed.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
  },
});

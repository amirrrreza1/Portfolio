import { defineConfig } from "vitest/config";

/**
 * Node-environment tests only, for now.
 *
 * The M0 suites cover pure logic and repository asset integrity, so they need
 * no DOM. Component and accessibility tests arrive with the design-system
 * boundary in M5; that is when a browser environment and a React testing setup
 * are worth their dependency weight.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
  },
});

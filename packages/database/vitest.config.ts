import { defineConfig } from "vitest/config";

/**
 * The constraint suite starts an in-process PostgreSQL (PGlite) and shells out
 * to Prisma to generate DDL, so the default 5s hook timeout is far too short.
 * It still needs no database server, which is the point.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    hookTimeout: 180_000,
    testTimeout: 60_000,
  },
});

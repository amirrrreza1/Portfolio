import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 keeps connection configuration out of schema.prisma. The runtime
 * client still validates DATABASE_URL independently before creating a pool.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Generation and schema-diff tests need no live database. The unreachable
    // fallback prevents those non-connecting commands from accepting a real
    // default target; migrations and the runtime still require DATABASE_URL.
    url:
      process.env.DATABASE_URL ??
      "postgresql://unused:unused@127.0.0.1:1/unused?schema=public",
  },
});

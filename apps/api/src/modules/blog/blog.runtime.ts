import { getDatabaseClient } from "@portfolio/database";

import { parseApiEnvironment } from "../../config/environment.js";
import { BlogAdminService } from "./blog.service.js";

/**
 * Mirrors the admin runtime's inert adapter for the same reason: module tests
 * build the whole AppModule with narrow overrides and no deployment
 * environment, and a factory that demanded a live PostgreSQL would make every
 * unrelated controller test need one.
 */
export function createBlogAdminService(): BlogAdminService {
  if (process.env.DATABASE_URL === undefined) {
    const unavailable = new Proxy(
      {},
      {
        get() {
          throw new Error("The blog database is unavailable.");
        },
      }
    );
    return new BlogAdminService(unavailable as never);
  }
  const environment = parseApiEnvironment(process.env);
  return new BlogAdminService(
    getDatabaseClient({ connectionString: environment.databaseUrl }),
    process.env.PUBLIC_SITE_URL ?? null
  );
}

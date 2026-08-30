import { getDatabaseClient } from "@portfolio/database";
import { createS3MediaObjectStore } from "@portfolio/media";

import { parseApiEnvironment } from "../../config/environment.js";
import { AdminPortfolioService } from "./admin.service.js";

export function createAdminPortfolioService(): AdminPortfolioService {
  // Public/controller unit tests construct the whole AppModule with narrow
  // provider overrides and deliberately no deployment environment. The real
  // entrypoint validates every variable before Nest starts; this inert adapter
  // keeps unrelated module tests from needing live PostgreSQL and MinIO.
  if (process.env.DATABASE_URL === undefined) {
    const unavailable = new Proxy(
      {},
      {
        get() {
          throw new Error("The admin database is unavailable.");
        },
      }
    );
    return new AdminPortfolioService(unavailable as never);
  }
  const environment = parseApiEnvironment(process.env);
  return new AdminPortfolioService(
    getDatabaseClient({ connectionString: environment.databaseUrl }),
    createS3MediaObjectStore(environment.media),
    environment.auth.recoverySecret,
    process.env.PUBLIC_SITE_URL ?? null
  );
}

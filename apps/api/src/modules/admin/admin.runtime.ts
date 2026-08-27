import { getDatabaseClient } from "@portfolio/database";

import { parseApiEnvironment } from "../../config/environment.js";
import { AdminPortfolioService } from "./admin.service.js";

export function createAdminPortfolioService(): AdminPortfolioService {
  const environment = parseApiEnvironment(process.env);
  return new AdminPortfolioService(
    getDatabaseClient({ connectionString: environment.databaseUrl })
  );
}

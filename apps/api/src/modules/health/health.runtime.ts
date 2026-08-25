import {
  createContentJobStore,
  createPrismaSqlExecutor,
  getDatabaseClient,
  type ContentJobStore,
} from "@portfolio/database";

import {
  DEFAULT_MAX_QUEUE_AGE_SECONDS,
  type ReadinessProbes,
  type ReadinessThresholds,
} from "./health.service.js";

export function createReadinessProbes(): ReadinessProbes {
  let resources: {
    readonly database: ReturnType<typeof getDatabaseClient>;
    readonly jobs: ContentJobStore;
  } | null = null;

  const resolve = (): typeof resources => {
    if (resources !== null) return resources;
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return null;
    const database = getDatabaseClient({ connectionString });
    resources = {
      database,
      jobs: createContentJobStore(createPrismaSqlExecutor(database)),
    };
    return resources;
  };

  return {
    databaseReachable: async () => {
      const resolved = resolve();
      if (resolved === null) return false;
      try {
        await resolved.database.$queryRawUnsafe("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },
    queue: async () => {
      const resolved = resolve();
      if (resolved === null) return null;
      try {
        return await resolved.jobs.metrics();
      } catch {
        return null;
      }
    },
  };
}

export function readinessThresholdsFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env
): ReadinessThresholds {
  const raw = Number(environment.PUBLICATION_QUEUE_MAX_AGE_SECONDS);
  return {
    maxQueueAgeSeconds:
      Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_QUEUE_AGE_SECONDS,
  };
}

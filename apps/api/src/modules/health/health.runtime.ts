import {
  createContentJobStore,
  createPrismaSqlExecutor,
  getDatabaseClient,
  type ContentJobStore,
} from "@portfolio/database";

import { loadContentRuntime } from "../content/content.runtime.js";
import {
  DEFAULT_MAX_QUEUE_AGE_SECONDS,
  type ReadinessProbes,
  type ReadinessThresholds,
} from "./health.service.js";

/**
 * Wires the readiness probes to the real database.
 *
 * Everything here resolves lazily, and nothing throws at construction. That is
 * deliberate: a provider that demands `DATABASE_URL` while Nest is building the
 * module graph turns a missing variable into "the process will not start",
 * which is the one failure mode a health endpoint exists to report. Failing to
 * construct the thing that reports failures is a poor trade.
 *
 * The content-store configuration is resolved once and memoized rather than per
 * request. It comes from environment variables and a key file, neither of which
 * changes while the process runs, and re-reading a private key on the most
 * frequently polled endpoint in the deployment is self-inflicted I/O.
 */
export function createReadinessProbes(): ReadinessProbes {
  let resources: {
    readonly database: ReturnType<typeof getDatabaseClient>;
    readonly jobs: ContentJobStore;
  } | null = null;
  let contentState: Promise<"configured" | "unconfigured" | "invalid"> | null =
    null;

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
        // Swallowed on purpose: the caller wants a verdict, and the driver's
        // error text can carry the connection string.
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
    contentConfigured: () => {
      contentState ??= loadContentRuntime().then((runtime) =>
        runtime.state === "configured"
          ? ("configured" as const)
          : runtime.state === "invalid"
            ? ("invalid" as const)
            : ("unconfigured" as const)
      );
      return contentState;
    },
  };
}

export function readinessThresholdsFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env
): ReadinessThresholds {
  const raw = Number(environment.CONTENT_QUEUE_MAX_AGE_SECONDS);
  return {
    maxQueueAgeSeconds:
      Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_QUEUE_AGE_SECONDS,
  };
}

import {
  createContentJobStore,
  createPrismaSqlExecutor,
  getDatabaseClient,
  type ContentJobStore,
} from "@portfolio/database";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

import { parseApiEnvironment } from "../../config/environment.js";

import {
  DEFAULT_MAX_QUEUE_AGE_SECONDS,
  type ReadinessProbes,
  type ReadinessThresholds,
} from "./health.service.js";

export function createReadinessProbes(): ReadinessProbes {
  let resources: {
    readonly database: ReturnType<typeof getDatabaseClient>;
    readonly jobs: ContentJobStore;
    readonly storage: S3Client;
    readonly bucket: string;
  } | null = null;

  const resolve = (): typeof resources => {
    if (resources !== null) return resources;
    let environment: ReturnType<typeof parseApiEnvironment>;
    try {
      environment = parseApiEnvironment(process.env);
    } catch {
      return null;
    }
    const database = getDatabaseClient({
      connectionString: environment.databaseUrl,
    });
    resources = {
      database,
      jobs: createContentJobStore(createPrismaSqlExecutor(database)),
      storage: new S3Client({
        endpoint: environment.media.endpoint,
        region: environment.media.region,
        forcePathStyle: environment.media.forcePathStyle,
        credentials: {
          accessKeyId: environment.media.accessKeyId,
          secretAccessKey: environment.media.secretAccessKey,
        },
      }),
      bucket: environment.media.bucket,
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
    storageReachable: async () => {
      const resolved = resolve();
      if (resolved === null) return false;
      try {
        await resolved.storage.send(
          new HeadBucketCommand({ Bucket: resolved.bucket })
        );
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

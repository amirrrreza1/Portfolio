import { setTimeout as delay } from "node:timers/promises";

import {
  ADVISORY_LOCKS,
  createAdvisoryLockPool,
  createContentJobStore,
  createDatabaseClient,
  createInvalidationOutboxStore,
  createPrismaSqlExecutor,
  enqueueDuePublications,
  publishDueTranslation,
  withAdvisoryLock,
} from "@portfolio/database";

import {
  runContentScheduler,
  runContentWorker,
  runUnderExclusiveLock,
} from "./content-worker.js";
import { runInvalidationDrain } from "./invalidation-drain.js";
import { createSignedInvalidationSender } from "./invalidation-sender.js";

type Mode = "publication" | "scheduler";

const DEFAULTS = {
  leaseSeconds: 300,
  idleDelayMs: 2_000,
  schedulerIntervalMs: 60_000,
  lockRetryMs: 30_000,
  invalidationMaxAttempts: 8,
  invalidationVisibilitySeconds: 120,
  invalidationBatchSize: 20,
  invalidationIdleMs: 1_000,
} as const;

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2), process.env.WORKER_MODE);
  const database = createDatabaseClient({
    connectionString: required("DATABASE_URL"),
  });
  const jobs = createContentJobStore(createPrismaSqlExecutor(database));
  const lockPool = createAdvisoryLockPool(required("DATABASE_URL"));
  let running = true;
  const stop = (): void => {
    running = false;
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  const workerName = `${mode}@${process.pid}`;
  log({ event: "starting", mode, worker: workerName });

  try {
    if (mode === "scheduler") {
      await withLockOrIdle(
        lockPool,
        ADVISORY_LOCKS.scheduler,
        () => running,
        async () => {
          await runContentScheduler({
            enqueueDue: () => enqueueDuePublications(database, jobs),
            intervalMs: number(process.env.SCHEDULER_POLL_SECONDS, 60) * 1_000,
            sleep: (ms) => delay(ms),
            running: () => running,
            log: (event) => log({ ...event, mode }),
          });
        }
      );
      return;
    }

    const invalidationEndpoint = process.env.CACHE_INVALIDATION_URL?.trim();
    const invalidationSecret = process.env.CACHE_INVALIDATION_SECRET?.trim();
    await withLockOrIdle(
      lockPool,
      ADVISORY_LOCKS.publication,
      () => running,
      async () => {
        const tasks: Promise<unknown>[] = [
          runContentWorker({
            jobs,
            handlers: {
              PUBLISH_DUE: async (job) => {
                const translationId = readTranslationId(job.payload);
                await publishDueTranslation(database, translationId);
              },
            },
            worker: workerName,
            leaseSeconds: number(
              process.env.PUBLICATION_WORKER_LEASE_SECONDS,
              DEFAULTS.leaseSeconds
            ),
            idleDelayMs: number(
              process.env.PUBLICATION_WORKER_IDLE_MS,
              DEFAULTS.idleDelayMs
            ),
            sleep: (ms) => delay(ms),
            running: () => running,
            log: (event) => log({ ...event, mode }),
          }),
        ];
        if (invalidationEndpoint && invalidationSecret) {
          tasks.push(
            runInvalidationDrain({
              outbox: createInvalidationOutboxStore(
                createPrismaSqlExecutor(database)
              ),
              sender: createSignedInvalidationSender({
                endpoint: invalidationEndpoint,
                secret: invalidationSecret,
              }),
              maxAttempts: DEFAULTS.invalidationMaxAttempts,
              visibilitySeconds: DEFAULTS.invalidationVisibilitySeconds,
              batchSize: DEFAULTS.invalidationBatchSize,
              idleDelayMs: DEFAULTS.invalidationIdleMs,
              sleep: (ms) => delay(ms),
              running: () => running,
              log: (event) => log({ ...event, mode }),
            })
          );
        } else {
          log({ event: "invalidation-unconfigured", mode });
        }
        await Promise.all(tasks);
      }
    );
  } finally {
    await lockPool.end();
    await database.$disconnect();
  }
}

function readTranslationId(payload: unknown): string {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("translationId" in payload)
  ) {
    throw new Error("Publication job payload is invalid.");
  }
  const value = (payload as { translationId?: unknown }).translationId;
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new Error("Publication job translation id is invalid.");
  }
  return value;
}

async function withLockOrIdle(
  database: Parameters<typeof withAdvisoryLock>[0],
  key: bigint,
  running: () => boolean,
  run: () => Promise<void>
): Promise<void> {
  await runUnderExclusiveLock({
    withLock: (work) => withAdvisoryLock(database, key, work),
    work: run,
    retryDelayMs: DEFAULTS.lockRetryMs,
    sleep: (ms) => delay(ms),
    running,
    log: () => log({ event: "lock-held-elsewhere" }),
  });
}

function parseMode(argv: readonly string[], fallback?: string): Mode {
  const flag = argv
    .find((value) => value.startsWith("--mode="))
    ?.slice("--mode=".length);
  const value = flag ?? fallback ?? "publication";
  if (value !== "publication" && value !== "scheduler") {
    throw new Error(`Unknown worker mode ${JSON.stringify(value)}.`);
  }
  return value;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function number(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function log(fields: Readonly<Record<string, unknown>>): void {
  process.stdout.write(
    `${JSON.stringify({ ts: new Date().toISOString(), ...fields })}\n`
  );
}

await main();

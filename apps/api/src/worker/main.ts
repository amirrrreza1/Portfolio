import { setTimeout as delay } from "node:timers/promises";

import {
  createFetchGitContentTransport,
  createGitHubContentStoreFromRuntime,
  reconcileContentHead,
} from "@portfolio/content-store";
import {
  ADVISORY_LOCKS,
  createContentIndexStore,
  createContentJobStore,
  createDatabaseClient,
  createPrismaSqlExecutor,
  withAdvisoryLock,
} from "@portfolio/database";

import { loadContentRuntime } from "../modules/content/content.runtime.js";
import {
  runContentScheduler,
  runContentWorker,
  type ContentJobHandler,
} from "./content-worker.js";

/**
 * The background process from ADR-013.
 *
 * Two modes, one binary, built from the API workspace so it shares the same
 * domain modules rather than reimplementing them:
 *
 *   sync       claims and runs content jobs
 *   scheduler  enqueues the periodic reconciliation
 *
 * Both take a PostgreSQL advisory lock and exit the loop if they cannot get it,
 * so running two copies is harmless: the second one idles instead of doubling
 * the work. HTTP API replicas run neither.
 */

type Mode = "sync" | "scheduler";

const DEFAULTS = {
  leaseSeconds: 300,
  idleDelayMs: 2_000,
  reconcileIntervalMs: 15 * 60 * 1_000,
  lockRetryMs: 30_000,
} as const;

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2), process.env.WORKER_MODE);
  const connectionString = required("DATABASE_URL");
  const database = createDatabaseClient({ connectionString });
  const jobs = createContentJobStore(createPrismaSqlExecutor(database));

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
        database,
        ADVISORY_LOCKS.scheduler,
        () => running,
        async () => {
          const summary = await runContentScheduler({
            jobs,
            intervalMs: number(
              process.env.CONTENT_RECONCILE_INTERVAL_MS,
              DEFAULTS.reconcileIntervalMs
            ),
            sleep: (ms) => delay(ms),
            running: () => running,
            log: (event) => log({ event: event.type, mode }),
          });
          log({ event: "stopped", mode, ...summary });
        }
      );
      return;
    }

    const runtime = await loadContentRuntime();
    if (runtime.state !== "configured") {
      // Unlike the HTTP API, this process has nothing else to do. Exiting
      // non-zero is deliberate: a supervisor restarting it is correct once the
      // GitHub App exists, and a worker that idles quietly looks healthy while
      // the queue silently grows.
      log({
        event: "unconfigured",
        mode,
        reason:
          runtime.state === "invalid" ? runtime.reason : "not provisioned",
      });
      process.exitCode = 1;
      return;
    }

    const store = await createGitHubContentStoreFromRuntime(
      runtime.config,
      createFetchGitContentTransport()
    );
    const index = createContentIndexStore(database);

    // The payload is not read. Both kinds reconcile the branch head, because
    // the webhook body is a trigger and the scheduled pass is a full sweep, and
    // reconciling from Git is the only path that validates content from scratch.
    const reconcile: ContentJobHandler = async () => {
      const summary = await reconcileContentHead({ store, index });
      log({ event: "reconciled", mode, ...summary });
    };

    await withLockOrIdle(
      database,
      ADVISORY_LOCKS.contentSync,
      () => running,
      async () => {
        const summary = await runContentWorker({
          jobs,
          handlers: {
            WEBHOOK_RECONCILE: reconcile,
            SCHEDULED_RECONCILE: reconcile,
            // PUBLISH_DUE has no handler yet; M8 owns scheduled publication.
            // Nothing enqueues it, and if something does it dead-letters
            // visibly rather than being silently dropped.
          },
          worker: workerName,
          leaseSeconds: number(
            process.env.CONTENT_WORKER_LEASE_SECONDS,
            DEFAULTS.leaseSeconds
          ),
          idleDelayMs: number(
            process.env.CONTENT_WORKER_IDLE_MS,
            DEFAULTS.idleDelayMs
          ),
          sleep: (ms) => delay(ms),
          running: () => running,
          log: (event) => log({ ...event, mode }),
        });
        log({ event: "stopped", mode, ...summary });
      }
    );
  } finally {
    await database.$disconnect();
  }
}

/**
 * Runs the loop while holding the lock, and waits rather than exiting if
 * another process holds it.
 *
 * Exiting would make a supervisor restart it immediately, producing a crash
 * loop for what is a completely normal state during a rolling deploy: the old
 * process still holds the lock while the new one starts.
 */
async function withLockOrIdle(
  database: Parameters<typeof withAdvisoryLock>[0],
  key: bigint,
  running: () => boolean,
  run: () => Promise<void>
): Promise<void> {
  while (running()) {
    const held = await withAdvisoryLock(database, key, run);
    if (held !== null) return;
    log({ event: "lock-held-elsewhere" });
    await delay(DEFAULTS.lockRetryMs);
  }
}

function parseMode(argv: readonly string[], fallback?: string): Mode {
  const flag = argv
    .find((value) => value.startsWith("--mode="))
    ?.slice("--mode=".length);
  const value = flag ?? fallback ?? "sync";
  if (value !== "sync" && value !== "scheduler") {
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

/** Structured single-line output; the process logger belongs to M9. */
function log(fields: Readonly<Record<string, unknown>>): void {
  process.stdout.write(
    `${JSON.stringify({ ts: new Date().toISOString(), ...fields })}\n`
  );
}

await main();

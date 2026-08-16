import type { ContentQueueMetrics } from "@portfolio/database";

/**
 * Readiness, as ADR-013 defines it: liveness and readiness are different
 * questions, and queue health is reported without becoming a public-read
 * dependency.
 *
 * That last clause is the whole design. A backed-up sync queue or an
 * unprovisioned GitHub App must never make this endpoint say "not ready",
 * because an orchestrator acting on that would pull a replica that is serving
 * the blog and the portfolio perfectly well out of rotation. Those routes read
 * PostgreSQL. They have never read Git.
 *
 * So exactly one thing here is fatal — the database — and everything else
 * degrades loudly instead.
 */

export type HealthState = "ok" | "degraded" | "unavailable";

export type ContentSyncState =
  "ok" | "unconfigured" | "misconfigured" | "backlogged" | "failing";

export interface ReadinessProbes {
  /** Resolves false rather than throwing; a probe that throws is a bug here. */
  readonly databaseReachable: () => Promise<boolean>;
  /** Null when the queue cannot be read, which is itself only degradation. */
  readonly queue: () => Promise<ContentQueueMetrics | null>;
  readonly contentConfigured: () => Promise<
    "configured" | "unconfigured" | "invalid"
  >;
}

export interface ReadinessThresholds {
  /** Oldest due-and-waiting job age that still counts as keeping up. */
  readonly maxQueueAgeSeconds: number;
}

export interface ReadinessReport {
  readonly status: HealthState;
  readonly database: "ok" | "unavailable";
  readonly contentSync: ContentSyncState;
  readonly queue: {
    readonly pending: number;
    readonly claimed: number;
    readonly dead: number;
    readonly expiredLeases: number;
    readonly oldestPendingAgeSeconds: number | null;
  } | null;
}

export const DEFAULT_MAX_QUEUE_AGE_SECONDS = 300;

export async function evaluateReadiness(
  probes: ReadinessProbes,
  thresholds: ReadinessThresholds = {
    maxQueueAgeSeconds: DEFAULT_MAX_QUEUE_AGE_SECONDS,
  }
): Promise<ReadinessReport> {
  const databaseReachable = await probes.databaseReachable();
  if (!databaseReachable) {
    const declared = await probes.contentConfigured();
    // The only genuinely not-ready case: every public route reads PostgreSQL,
    // so a replica that cannot reach it serves nothing.
    return {
      status: "unavailable",
      database: "unavailable",
      contentSync:
        declared === "configured"
          ? "failing"
          : configuredStateToSyncState(declared),
      queue: null,
    };
  }

  const configured = await probes.contentConfigured();
  const metrics = configured === "configured" ? await probes.queue() : null;
  const contentSync = resolveContentSyncState(
    configured,
    metrics,
    thresholds.maxQueueAgeSeconds
  );

  return {
    status: contentSync === "ok" ? "ok" : "degraded",
    database: "ok",
    contentSync,
    queue:
      metrics === null
        ? null
        : {
            pending: metrics.pending,
            claimed: metrics.claimed,
            dead: metrics.dead,
            expiredLeases: metrics.expiredLeases,
            oldestPendingAgeSeconds: metrics.oldestPendingAgeSeconds,
          },
  };
}

function configuredStateToSyncState(
  configured: "configured" | "unconfigured" | "invalid"
): ContentSyncState {
  return configured === "invalid" ? "misconfigured" : "unconfigured";
}

function resolveContentSyncState(
  configured: "configured" | "unconfigured" | "invalid",
  metrics: ContentQueueMetrics | null,
  maxQueueAgeSeconds: number
): ContentSyncState {
  if (configured !== "configured")
    return configuredStateToSyncState(configured);
  // Configured but unreadable: the store exists and we cannot tell how it is
  // doing, which is a worse signal than a known backlog, not a better one.
  if (metrics === null) return "failing";
  // Dead letters first. A backlog usually drains; a dead job never does, and it
  // is the one state that always needs a human.
  if (metrics.dead > 0 || metrics.expiredLeases > 0) return "failing";
  if (
    metrics.oldestPendingAgeSeconds !== null &&
    metrics.oldestPendingAgeSeconds > maxQueueAgeSeconds
  ) {
    return "backlogged";
  }
  return "ok";
}

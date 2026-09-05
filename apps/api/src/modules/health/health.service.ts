import type { ContentQueueMetrics } from "@portfolio/database";

export type HealthState = "ok" | "degraded" | "unavailable";
export type PublicationState = "ok" | "backlogged" | "failing";

export interface ReadinessProbes {
  readonly databaseReachable: () => Promise<boolean>;
  readonly storageReachable: () => Promise<boolean>;
  readonly queue: () => Promise<ContentQueueMetrics | null>;
}

export interface ReadinessThresholds {
  readonly maxQueueAgeSeconds: number;
}

export interface ReadinessReport {
  readonly status: HealthState;
  readonly database: "ok" | "unavailable";
  readonly storage: "ok" | "unavailable" | "unknown";
  readonly publication: PublicationState;
  readonly queue: {
    readonly pending: number;
    readonly claimed: number;
    readonly dead: number;
    readonly expiredLeases: number;
    readonly oldestPendingAgeSeconds: number | null;
  } | null;
}

export const DEFAULT_MAX_QUEUE_AGE_SECONDS = 300;

/** Database reachability is fatal; publication backlog is visible degradation. */
export async function evaluateReadiness(
  probes: ReadinessProbes,
  thresholds: ReadinessThresholds = {
    maxQueueAgeSeconds: DEFAULT_MAX_QUEUE_AGE_SECONDS,
  }
): Promise<ReadinessReport> {
  if (!(await probes.databaseReachable())) {
    return {
      status: "unavailable",
      database: "unavailable",
      storage: "unknown",
      publication: "failing",
      queue: null,
    };
  }

  const [metrics, storageReachable] = await Promise.all([
    probes.queue(),
    probes.storageReachable(),
  ]);
  const publication = resolvePublicationState(
    metrics,
    thresholds.maxQueueAgeSeconds
  );
  return {
    status: !storageReachable
      ? "unavailable"
      : publication === "ok"
        ? "ok"
        : "degraded",
    database: "ok",
    storage: storageReachable ? "ok" : "unavailable",
    publication,
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

function resolvePublicationState(
  metrics: ContentQueueMetrics | null,
  maxQueueAgeSeconds: number
): PublicationState {
  if (metrics === null) return "failing";
  if (metrics.dead > 0 || metrics.expiredLeases > 0) return "failing";
  if (
    metrics.oldestPendingAgeSeconds !== null &&
    metrics.oldestPendingAgeSeconds > maxQueueAgeSeconds
  ) {
    return "backlogged";
  }
  return "ok";
}

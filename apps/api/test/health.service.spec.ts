import type { ContentQueueMetrics } from "@portfolio/database";
import { describe, expect, it } from "vitest";

import {
  evaluateReadiness,
  type ReadinessProbes,
} from "../src/modules/health/health.service.js";

const HEALTHY_QUEUE: ContentQueueMetrics = {
  pending: 0,
  claimed: 0,
  dead: 0,
  expiredLeases: 0,
  oldestPendingAgeSeconds: null,
};

function probes(overrides: Partial<ReadinessProbes> = {}): ReadinessProbes {
  return {
    databaseReachable: async () => true,
    storageReachable: async () => true,
    queue: async () => HEALTHY_QUEUE,
    ...overrides,
  };
}

describe("evaluateReadiness", () => {
  it("is ok when PostgreSQL and the publication queue are current", async () => {
    const report = await evaluateReadiness(probes());
    expect(report).toMatchObject({
      status: "ok",
      database: "ok",
      storage: "ok",
      publication: "ok",
    });
  });

  it("is unavailable only when PostgreSQL is unreachable", async () => {
    const report = await evaluateReadiness(
      probes({ databaseReachable: async () => false })
    );
    expect(report).toMatchObject({
      status: "unavailable",
      database: "unavailable",
      storage: "unknown",
      publication: "failing",
      queue: null,
    });
  });

  it("is unavailable when private object storage cannot be reached", async () => {
    const report = await evaluateReadiness(
      probes({ storageReachable: async () => false })
    );
    expect(report).toMatchObject({
      status: "unavailable",
      database: "ok",
      storage: "unavailable",
    });
  });

  it("reports a backlog without refusing traffic", async () => {
    const report = await evaluateReadiness(
      probes({
        queue: async () => ({
          ...HEALTHY_QUEUE,
          pending: 4,
          oldestPendingAgeSeconds: 900,
        }),
      }),
      { maxQueueAgeSeconds: 300 }
    );
    expect(report.status).toBe("degraded");
    expect(report.publication).toBe("backlogged");
  });

  it("reports dead letters and expired leases as failing", async () => {
    const dead = await evaluateReadiness(
      probes({ queue: async () => ({ ...HEALTHY_QUEUE, dead: 1 }) })
    );
    const expired = await evaluateReadiness(
      probes({ queue: async () => ({ ...HEALTHY_QUEUE, expiredLeases: 1 }) })
    );
    expect(dead.publication).toBe("failing");
    expect(expired.publication).toBe("failing");
  });

  it("treats an unreadable queue as failing", async () => {
    const report = await evaluateReadiness(probes({ queue: async () => null }));
    expect(report.status).toBe("degraded");
    expect(report.publication).toBe("failing");
    expect(report.queue).toBeNull();
  });
});

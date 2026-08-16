import type { ContentQueueMetrics } from "@portfolio/database";
import { describe, expect, it } from "vitest";

import {
  evaluateReadiness,
  type ReadinessProbes,
} from "../src/modules/health/health.service.js";

/**
 * Readiness must degrade, not fail, for everything except the database.
 *
 * The point of these assertions is the status code an orchestrator acts on. A
 * replica pulled from rotation because the content queue is behind is an
 * outage of the blog and the portfolio — routes that read PostgreSQL and have
 * never touched Git.
 */

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
    queue: async () => HEALTHY_QUEUE,
    contentConfigured: async () => "configured",
    ...overrides,
  };
}

describe("evaluateReadiness", () => {
  it("is ok when the database answers and the queue is current", async () => {
    const report = await evaluateReadiness(probes());

    expect(report.status).toBe("ok");
    expect(report.database).toBe("ok");
    expect(report.contentSync).toBe("ok");
  });

  it("is unavailable only when the database is unreachable", async () => {
    const report = await evaluateReadiness(
      probes({ databaseReachable: async () => false })
    );

    expect(report.status).toBe("unavailable");
    expect(report.database).toBe("unavailable");
    // Not probed: a queue read needs the database that just failed.
    expect(report.queue).toBeNull();
  });

  it("stays servable with no content store provisioned", async () => {
    const report = await evaluateReadiness(
      probes({ contentConfigured: async () => "unconfigured" })
    );

    expect(report.status).toBe("degraded");
    expect(report.contentSync).toBe("unconfigured");
    expect(report.database).toBe("ok");
  });

  it("distinguishes a broken configuration from a missing one", async () => {
    const report = await evaluateReadiness(
      probes({ contentConfigured: async () => "invalid" })
    );

    expect(report.contentSync).toBe("misconfigured");
    expect(report.status).toBe("degraded");
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

    expect(report.contentSync).toBe("backlogged");
    expect(report.status).toBe("degraded");
    expect(report.queue?.oldestPendingAgeSeconds).toBe(900);
  });

  it("treats a queue within its age budget as current", async () => {
    const report = await evaluateReadiness(
      probes({
        queue: async () => ({
          ...HEALTHY_QUEUE,
          pending: 2,
          oldestPendingAgeSeconds: 30,
        }),
      }),
      { maxQueueAgeSeconds: 300 }
    );

    expect(report.contentSync).toBe("ok");
  });

  it("reports a dead-lettered job as failing even with an empty queue", async () => {
    // A backlog drains on its own; a dead job never does.
    const report = await evaluateReadiness(
      probes({ queue: async () => ({ ...HEALTHY_QUEUE, dead: 1 }) })
    );

    expect(report.contentSync).toBe("failing");
    expect(report.status).toBe("degraded");
  });

  it("reports lapsed leases as failing", async () => {
    const report = await evaluateReadiness(
      probes({ queue: async () => ({ ...HEALTHY_QUEUE, expiredLeases: 2 }) })
    );

    expect(report.contentSync).toBe("failing");
  });

  it("treats an unreadable queue as failing rather than as healthy", async () => {
    const report = await evaluateReadiness(probes({ queue: async () => null }));

    expect(report.contentSync).toBe("failing");
    expect(report.queue).toBeNull();
  });

  it("does not probe the queue when no content store is configured", async () => {
    let probed = false;
    const report = await evaluateReadiness(
      probes({
        contentConfigured: async () => "unconfigured",
        queue: async () => {
          probed = true;
          return HEALTHY_QUEUE;
        },
      })
    );

    expect(probed).toBe(false);
    expect(report.queue).toBeNull();
  });
});

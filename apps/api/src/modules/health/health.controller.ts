import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";

import {
  evaluateReadiness,
  type ReadinessProbes,
  type ReadinessReport,
  type ReadinessThresholds,
} from "./health.service.js";

export const READINESS_PROBES = Symbol("READINESS_PROBES");
export const READINESS_THRESHOLDS = Symbol("READINESS_THRESHOLDS");

@Controller("health")
export class HealthController {
  public constructor(
    @Inject(READINESS_PROBES) private readonly probes: ReadinessProbes,
    @Inject(READINESS_THRESHOLDS)
    private readonly thresholds: ReadinessThresholds
  ) {}

  /**
   * Liveness. Answers if the process is running and nothing else.
   *
   * Kept at the original path and shape so existing checks and the smoke test
   * keep working. A liveness probe that consults a dependency is a restart loop
   * waiting for that dependency to blink.
   */
  @Get()
  check(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("live")
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  /**
   * Readiness. 503 only when this replica genuinely cannot serve; a degraded
   * content pipeline reports itself at 200 and stays in rotation.
   */
  @Get("ready")
  async ready(
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<ReadinessReport> {
    const report = await evaluateReadiness(this.probes, this.thresholds);
    reply.status(report.status === "unavailable" ? 503 : 200);
    return report;
  }
}

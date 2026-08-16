import { Module } from "@nestjs/common";

import {
  HealthController,
  READINESS_PROBES,
  READINESS_THRESHOLDS,
} from "./health.controller.js";
import {
  createReadinessProbes,
  readinessThresholdsFromEnvironment,
} from "./health.runtime.js";

@Module({
  controllers: [HealthController],
  providers: [
    { provide: READINESS_PROBES, useFactory: createReadinessProbes },
    {
      provide: READINESS_THRESHOLDS,
      useFactory: () => readinessThresholdsFromEnvironment(),
    },
  ],
})
export class HealthModule {}

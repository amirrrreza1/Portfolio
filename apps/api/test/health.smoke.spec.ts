import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { afterEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import {
  APPLICATION_OPTIONS,
  configureApplication,
} from "../src/configure-app.js";
import { CONTACT_SUBMISSION_SERVICE } from "../src/modules/contact/contact.controller.js";
import {
  READINESS_PROBES,
  READINESS_THRESHOLDS,
} from "../src/modules/health/health.controller.js";
import { PUBLIC_APPEARANCE_SERVICE } from "../src/modules/public/public-appearance.controller.js";
import { PUBLIC_ARTICLES_SERVICE } from "../src/modules/public/public-articles.controller.js";
import { PUBLIC_HOME_SERVICE } from "../src/modules/public/public-home.controller.js";
import { PUBLIC_PROJECTS_SERVICE } from "../src/modules/public/public-projects.controller.js";
import { PUBLIC_SITE_SERVICE } from "../src/modules/public/public-site.controller.js";

const HEALTHY_QUEUE = {
  pending: 0,
  claimed: 0,
  dead: 0,
  expiredLeases: 0,
  oldestPendingAgeSeconds: null,
};

async function createApp(overrides: {
  readonly probes?: unknown;
}): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONTACT_SUBMISSION_SERVICE)
    .useValue({ submit: async () => undefined })
    .overrideProvider(READINESS_PROBES)
    .useValue(
      overrides.probes ?? {
        databaseReachable: async () => true,
        queue: async () => HEALTHY_QUEUE,
      }
    )
    .overrideProvider(READINESS_THRESHOLDS)
    .useValue({ maxQueueAgeSeconds: 300 })
    .overrideProvider(PUBLIC_PROJECTS_SERVICE)
    .useValue({ read: async () => undefined })
    .overrideProvider(PUBLIC_SITE_SERVICE)
    .useValue({ read: async () => undefined })
    .overrideProvider(PUBLIC_APPEARANCE_SERVICE)
    .useValue({ read: async () => undefined })
    .overrideProvider(PUBLIC_ARTICLES_SERVICE)
    .useValue({ list: async () => undefined, detail: async () => undefined })
    .overrideProvider(PUBLIC_HOME_SERVICE)
    .useValue({ read: async () => undefined })
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false }),
    APPLICATION_OPTIONS
  );
  configureApplication(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe("API health smoke", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("serves the versioned health contract without leaking internals", async () => {
    app = await createApp({});

    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("answers liveness without consulting any dependency", async () => {
    // Deliberately given probes that would fail, to prove liveness ignores them:
    // a liveness check that consults the database is a restart loop.
    app = await createApp({
      probes: {
        databaseReachable: async () => {
          throw new Error("liveness must not probe the database");
        },
        queue: async () => null,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/health/live",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("reports ready when the database answers", async () => {
    app = await createApp({});

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/health/ready",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      database: "ok",
      publication: "ok",
    });
  });

  it("stays in rotation at 200 while the content pipeline is degraded", async () => {
    app = await createApp({
      probes: {
        databaseReachable: async () => true,
        queue: async () => ({ ...HEALTHY_QUEUE, dead: 3 }),
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/health/ready",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "degraded",
      publication: "failing",
    });
  });

  it("returns 503 only when the database is unreachable", async () => {
    app = await createApp({
      probes: {
        databaseReachable: async () => false,
        queue: async () => null,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/health/ready",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ database: "unavailable" });
  });
});

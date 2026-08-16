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
import { CONTENT_WEBHOOK_SERVICE } from "../src/modules/content/content-webhook.controller.js";
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
  readonly webhook?: unknown;
}): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONTACT_SUBMISSION_SERVICE)
    .useValue({ submit: async () => undefined })
    .overrideProvider(CONTENT_WEBHOOK_SERVICE)
    .useValue(
      overrides.webhook ?? {
        available: () => false,
        receive: async () => "rejected",
      }
    )
    .overrideProvider(READINESS_PROBES)
    .useValue(
      overrides.probes ?? {
        databaseReachable: async () => true,
        queue: async () => HEALTHY_QUEUE,
        contentConfigured: async () => "configured",
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
        contentConfigured: async () => "configured",
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
      contentSync: "ok",
    });
  });

  it("stays in rotation at 200 while the content pipeline is degraded", async () => {
    app = await createApp({
      probes: {
        databaseReachable: async () => true,
        queue: async () => ({ ...HEALTHY_QUEUE, dead: 3 }),
        contentConfigured: async () => "configured",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/health/ready",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "degraded",
      contentSync: "failing",
    });
  });

  it("returns 503 only when the database is unreachable", async () => {
    app = await createApp({
      probes: {
        databaseReachable: async () => false,
        queue: async () => null,
        contentConfigured: async () => "configured",
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

describe("content webhook route", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("answers 503 while no content store is provisioned", async () => {
    app = await createApp({});

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/content/webhook",
      headers: { "content-type": "application/json" },
      payload: "{}",
    });

    expect(response.statusCode).toBe(503);
  });

  it("passes the unmodified request bytes to signature verification", async () => {
    // The body below has whitespace and key order that JSON.stringify would not
    // reproduce. If the controller handed over a re-serialized body, this test
    // would see different bytes — which is exactly the bug that makes people
    // give up on verifying signatures.
    const raw = `{ "b":1,\n  "a":  2 }`;
    let seen: string | undefined;
    app = await createApp({
      webhook: {
        available: () => true,
        receive: async (input: { rawBody: Uint8Array }) => {
          seen = new TextDecoder().decode(input.rawBody);
          return "accepted";
        },
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/content/webhook",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=irrelevant",
        "x-github-delivery": "delivery-1",
      },
      payload: raw,
    });

    expect(response.statusCode).toBe(202);
    expect(seen).toBe(raw);
  });

  it("answers 401 for a rejected signature", async () => {
    app = await createApp({
      webhook: { available: () => true, receive: async () => "rejected" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/content/webhook",
      headers: { "content-type": "application/json" },
      payload: "{}",
    });

    expect(response.statusCode).toBe(401);
  });

  it("answers 200 for a redelivery so the sender stops retrying", async () => {
    app = await createApp({
      webhook: { available: () => true, receive: async () => "duplicate" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/content/webhook",
      headers: { "content-type": "application/json" },
      payload: "{}",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { status: "duplicate" } });
  });
});

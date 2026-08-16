import { createHmac } from "node:crypto";

import { InMemoryWebhookDeliveryStore } from "@portfolio/content-store";
import type { ContentJobStore, ContentQueueMetrics } from "@portfolio/database";
import { describe, expect, it } from "vitest";

import {
  createContentWebhookService,
  createUnavailableContentWebhookService,
} from "../src/modules/content/content-webhook.service.js";
import { loadContentRuntime } from "../src/modules/content/content.runtime.js";
import {
  CONTENT_HEAD_LOCK_KEY,
  WEBHOOK_RECONCILE_DEDUPE_KEY,
} from "../src/worker/content-worker.js";

const SECRET = "webhook-secret";

function sign(secret: string, body: Uint8Array): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function jobs(): { store: ContentJobStore; enqueued: unknown[] } {
  const enqueued: unknown[] = [];
  return {
    enqueued,
    store: {
      enqueue: async (input) => {
        enqueued.push(input);
        return "queued";
      },
      claim: async () => null,
      succeed: async () => undefined,
      fail: async () => "retrying",
      heartbeat: async () => true,
      reapExhaustedLeases: async () => 0,
      metrics: async (): Promise<ContentQueueMetrics> => ({
        pending: 0,
        claimed: 0,
        dead: 0,
        expiredLeases: 0,
        oldestPendingAgeSeconds: null,
      }),
    },
  };
}

function service() {
  const queue = jobs();
  return {
    queue,
    value: createContentWebhookService({
      webhookSecret: SECRET,
      deliveries: new InMemoryWebhookDeliveryStore(),
      jobs: queue.store,
    }),
  };
}

describe("content webhook service", () => {
  it("enqueues exactly one reconciliation for a signed delivery", async () => {
    const { value, queue } = service();
    const body = new TextEncoder().encode(`{"ref":"refs/heads/content"}`);

    const outcome = await value.receive({
      rawBody: body,
      signature: sign(SECRET, body),
      deliveryId: "delivery-1",
    });

    expect(outcome).toBe("accepted");
    expect(queue.enqueued).toEqual([
      {
        kind: "WEBHOOK_RECONCILE",
        lockKey: CONTENT_HEAD_LOCK_KEY,
        dedupeKey: WEBHOOK_RECONCILE_DEDUPE_KEY,
        payload: { reason: "webhook" },
      },
    ]);
  });

  it("never carries webhook data into the job payload", async () => {
    // CONTENT_PIPELINE.md §7: the body is a trigger. If any of it reached the
    // queue, a forged payload could influence what the worker applies.
    const { value, queue } = service();
    const body = new TextEncoder().encode(
      `{"commits":[{"added":["content/evil.md"]}]}`
    );

    await value.receive({
      rawBody: body,
      signature: sign(SECRET, body),
      deliveryId: "delivery-1",
    });

    expect(JSON.stringify(queue.enqueued)).not.toContain("evil");
  });

  it("rejects a bad signature and queues nothing", async () => {
    const { value, queue } = service();
    const body = new TextEncoder().encode("{}");

    const outcome = await value.receive({
      rawBody: body,
      signature: sign("wrong-secret", body),
      deliveryId: "delivery-1",
    });

    expect(outcome).toBe("rejected");
    expect(queue.enqueued).toEqual([]);
  });

  it("rejects a delivery with no signature at all", async () => {
    const { value } = service();

    expect(
      await value.receive({
        rawBody: new TextEncoder().encode("{}"),
        signature: undefined,
        deliveryId: "delivery-1",
      })
    ).toBe("rejected");
  });

  it("rejects a delivery with no id, because replay cannot be detected", async () => {
    const { value } = service();
    const body = new TextEncoder().encode("{}");

    expect(
      await value.receive({
        rawBody: body,
        signature: sign(SECRET, body),
        deliveryId: undefined,
      })
    ).toBe("rejected");
  });

  it("treats a redelivery as a duplicate and does not queue twice", async () => {
    const { value, queue } = service();
    const body = new TextEncoder().encode("{}");
    const signature = sign(SECRET, body);

    const first = await value.receive({
      rawBody: body,
      signature,
      deliveryId: "delivery-1",
    });
    const second = await value.receive({
      rawBody: body,
      signature,
      deliveryId: "delivery-1",
    });

    expect([first, second]).toEqual(["accepted", "duplicate"]);
    expect(queue.enqueued).toHaveLength(1);
  });

  it("reports itself unavailable when nothing is configured", async () => {
    const unavailable = createUnavailableContentWebhookService();

    expect(unavailable.available()).toBe(false);
    expect(
      await unavailable.receive({
        rawBody: new Uint8Array(),
        signature: undefined,
        deliveryId: undefined,
      })
    ).toBe("rejected");
  });
});

describe("loadContentRuntime", () => {
  const VALID = {
    CONTENT_GIT_PROVIDER: "github",
    CONTENT_GIT_BRANCH: "content",
    CONTENT_GIT_CONTENT_PREFIX: "content/",
    CONTENT_GIT_REPO: "amirrrreza1/Portfolio",
    CONTENT_GIT_APP_ID: "123456",
    CONTENT_GIT_INSTALLATION_ID: "654321",
    CONTENT_GIT_WEBHOOK_SECRET: "secret",
    CONTENT_GIT_PRIVATE_KEY_PATH: "/run/secrets/content.pem",
  };

  it("reports an environment with no content variables as unconfigured", async () => {
    expect(await loadContentRuntime({ DATABASE_URL: "postgres://x" })).toEqual({
      state: "unconfigured",
    });
  });

  it("loads a complete configuration", async () => {
    const runtime = await loadContentRuntime(VALID, async () => "PRIVATE KEY");

    expect(runtime.state).toBe("configured");
  });

  it("separates a broken configuration from a missing one", async () => {
    // Half-set variables are the dangerous case: treating them as "not
    // provisioned" makes a deployment mistake look like an intentional state.
    const runtime = await loadContentRuntime(
      { ...VALID, CONTENT_GIT_REPO: "" },
      async () => "PRIVATE KEY"
    );

    expect(runtime.state).toBe("invalid");
  });

  it("rejects a branch other than the dedicated content branch", async () => {
    const runtime = await loadContentRuntime(
      { ...VALID, CONTENT_GIT_BRANCH: "main" },
      async () => "PRIVATE KEY"
    );

    expect(runtime.state).toBe("invalid");
  });

  it("does not surface the private key path when the file cannot be read", async () => {
    const runtime = await loadContentRuntime(VALID, async () => {
      throw new Error("ENOENT: /run/secrets/content.pem");
    });

    expect(runtime.state).toBe("invalid");
    expect(runtime).not.toMatchObject({
      reason: expect.stringContaining("/run/secrets"),
    });
  });
});

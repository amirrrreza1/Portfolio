import {
  ContentWebhookHandler,
  type WebhookDeliveryStore,
} from "@portfolio/content-store";
import type { ContentJobStore } from "@portfolio/database";

import {
  WEBHOOK_RECONCILE_DEDUPE_KEY,
  CONTENT_HEAD_LOCK_KEY,
} from "../../worker/content-worker.js";

export interface ContentWebhookService {
  /** False when no content store is provisioned; the route answers 503. */
  available(): boolean;
  receive(input: {
    readonly rawBody: Uint8Array;
    readonly signature: string | undefined;
    readonly deliveryId: string | undefined;
  }): Promise<"accepted" | "duplicate" | "rejected">;
}

/** The service used when this deployment has no content store configured. */
export function createUnavailableContentWebhookService(): ContentWebhookService {
  return {
    available: () => false,
    receive: () => Promise.resolve("rejected"),
  };
}

export function createContentWebhookService(input: {
  readonly webhookSecret: string;
  readonly deliveries: WebhookDeliveryStore;
  readonly jobs: ContentJobStore;
}): ContentWebhookService {
  const handler = new ContentWebhookHandler(
    input.webhookSecret,
    input.deliveries,
    async () => {
      // The only thing a verified webhook produces. The payload is discarded:
      // the worker re-reads the branch head from Git, so a forged or stale body
      // cannot influence what gets applied.
      await input.jobs.enqueue({
        kind: "WEBHOOK_RECONCILE",
        lockKey: CONTENT_HEAD_LOCK_KEY,
        dedupeKey: WEBHOOK_RECONCILE_DEDUPE_KEY,
        payload: { reason: "webhook" },
      });
    }
  );

  return {
    available: () => true,
    receive: (request) => handler.receive(request),
  };
}

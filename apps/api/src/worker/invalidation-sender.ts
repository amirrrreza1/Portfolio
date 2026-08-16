import { createHash, createHmac, randomUUID } from "node:crypto";

import {
  INVALIDATION_HEADERS,
  invalidationSigningString,
  type InvalidationEvent,
} from "@portfolio/contracts/content";

/**
 * Signs and delivers one invalidation event (SECURITY.md §6).
 *
 * Timestamp, nonce, and body digest are all inside the signature. Signing the
 * body alone would let a captured request be replayed forever; signing the
 * timestamp without the body would let the body be swapped under a valid
 * signature. Each of the three closes a hole the other two leave open.
 */

export interface InvalidationDelivery {
  readonly ok: boolean;
  readonly status: number | null;
  readonly detail?: string;
}

export interface InvalidationSender {
  send(event: InvalidationEvent): Promise<InvalidationDelivery>;
}

const DEFAULT_TIMEOUT_MS = 5_000;

export function createSignedInvalidationSender(input: {
  readonly endpoint: string;
  readonly secret: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
  readonly nonce?: () => string;
}): InvalidationSender {
  const request = input.fetch ?? fetch;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = input.now ?? (() => new Date());
  const nonce = input.nonce ?? (() => randomUUID());

  if (!input.secret.trim()) {
    throw new Error("CACHE_INVALIDATION_SECRET is required.");
  }

  return {
    send: async (event) => {
      // Serialized once, then hashed and sent. Hashing a second serialization
      // would be a different byte string whenever key order or escaping
      // differed, and the receiver would reject every message.
      const body = JSON.stringify(event);
      const timestamp = Math.floor(now().getTime() / 1000).toString();
      const requestNonce = nonce();
      const bodySha256 = createHash("sha256")
        .update(body, "utf8")
        .digest("hex");
      const signature = createHmac("sha256", input.secret)
        .update(
          invalidationSigningString({
            timestamp,
            nonce: requestNonce,
            bodySha256,
          }),
          "utf8"
        )
        .digest("hex");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await request(input.endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [INVALIDATION_HEADERS.signature]: signature,
            [INVALIDATION_HEADERS.timestamp]: timestamp,
            [INVALIDATION_HEADERS.nonce]: requestNonce,
          },
          body,
          signal: controller.signal,
        });
        return {
          ok: response.ok,
          status: response.status,
          ...(response.ok ? {} : { detail: `HTTP ${response.status}` }),
        };
      } catch (error) {
        // Network failure and timeout are the same thing to the caller: the web
        // app was not told. The outbox row stays pending either way.
        return {
          ok: false,
          status: null,
          detail: error instanceof Error ? error.message : "request failed",
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

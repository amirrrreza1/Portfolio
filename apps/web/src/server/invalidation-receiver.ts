import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  INVALIDATION_CLOCK_SKEW_SECONDS,
  INVALIDATION_HEADERS,
  invalidationEventSchema,
  invalidationSigningString,
  type InvalidationEvent,
  type InvalidationRejection,
} from "@portfolio/contracts/content";

/**
 * Verifies a signed invalidation request (SECURITY.md §6).
 *
 * Server-only. Nothing here may be imported from a client component: it holds
 * the shared secret.
 *
 * Four checks, in a deliberate order — headers, clock, signature, then nonce.
 * The nonce is claimed *last* on purpose. Claiming it before the signature is
 * verified would let anyone with the endpoint URL burn nonces, and a forged
 * request would then be able to lock out the legitimate one that follows.
 */

export type InvalidationVerification =
  | { readonly ok: true; readonly event: InvalidationEvent }
  | { readonly ok: false; readonly rejection: InvalidationRejection };

export interface NonceStore {
  /** False when the nonce has been seen inside its retention window. */
  claim(nonce: string, expiresAt: number): boolean;
}

/**
 * In-memory replay store.
 *
 * The web app has no database — it reads everything through the API — so the
 * nonce store cannot be shared across replicas or survive a restart. That is
 * an accepted limit, not an oversight, and it is why the clock window matters:
 * it bounds how long a captured request stays replayable when this store is
 * empty. Entries are swept on write, so the map cannot grow without bound.
 */
export class MemoryNonceStore implements NonceStore {
  readonly #seen = new Map<string, number>();

  claim(nonce: string, expiresAt: number): boolean {
    const now = Date.now();
    for (const [key, expiry] of this.#seen) {
      if (expiry <= now) this.#seen.delete(key);
    }
    if (this.#seen.has(nonce)) return false;
    this.#seen.set(nonce, expiresAt);
    return true;
  }
}

export function verifyInvalidationRequest(input: {
  readonly rawBody: string;
  readonly headers: {
    readonly get: (name: string) => string | null;
  };
  readonly secret: string;
  readonly nonces: NonceStore;
  readonly now?: () => number;
}): InvalidationVerification {
  const signature = input.headers.get(INVALIDATION_HEADERS.signature);
  const timestamp = input.headers.get(INVALIDATION_HEADERS.timestamp);
  const nonce = input.headers.get(INVALIDATION_HEADERS.nonce);
  if (!signature || !timestamp || !nonce) {
    return { ok: false, rejection: "missing-headers" };
  }

  const issuedAtSeconds = Number(timestamp);
  if (!Number.isFinite(issuedAtSeconds) || !/^\d+$/.test(timestamp)) {
    return { ok: false, rejection: "malformed-timestamp" };
  }

  const nowSeconds = Math.floor((input.now?.() ?? Date.now()) / 1000);
  // Absolute difference, so a request from the future is rejected too. A
  // one-sided check would let a sender with a fast clock — or an attacker
  // choosing the timestamp — mint requests valid far beyond the window.
  if (
    Math.abs(nowSeconds - issuedAtSeconds) > INVALIDATION_CLOCK_SKEW_SECONDS
  ) {
    return { ok: false, rejection: "stale-timestamp" };
  }

  const bodySha256 = createHash("sha256")
    .update(input.rawBody, "utf8")
    .digest("hex");
  const expected = createHmac("sha256", input.secret)
    .update(invalidationSigningString({ timestamp, nonce, bodySha256 }), "utf8")
    .digest("hex");
  if (!constantTimeEquals(signature, expected)) {
    return { ok: false, rejection: "bad-signature" };
  }

  if (
    !input.nonces.claim(
      nonce,
      (issuedAtSeconds + INVALIDATION_CLOCK_SKEW_SECONDS) * 1000
    )
  ) {
    return { ok: false, rejection: "replayed-nonce" };
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(input.rawBody);
  } catch {
    return { ok: false, rejection: "malformed-body" };
  }
  const event = invalidationEventSchema.safeParse(parsedBody);
  if (!event.success) return { ok: false, rejection: "malformed-body" };

  return { ok: true, event: event.data };
}

/**
 * Constant-time comparison that does not leak length either.
 *
 * `timingSafeEqual` throws on differing lengths, and the usual `if
 * (a.length !== b.length) return false` guard reintroduces the timing signal
 * it was supposed to remove. Hashing both sides first makes every comparison
 * the same fixed width regardless of what arrived.
 */
function constantTimeEquals(candidate: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(candidate, "utf8").digest(),
    createHash("sha256").update(expected, "utf8").digest()
  );
}

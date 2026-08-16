import { createHash, createHmac } from "node:crypto";

import {
  INVALIDATION_CLOCK_SKEW_SECONDS,
  INVALIDATION_HEADERS,
  invalidationSigningString,
  type InvalidationEvent,
} from "@portfolio/contracts/content";
import { beforeEach, describe, expect, it } from "vitest";

import {
  MemoryNonceStore,
  verifyInvalidationRequest,
} from "../src/server/invalidation-receiver";

/**
 * The verification side of SECURITY.md §6.
 *
 * This endpoint is the one write-shaped surface the public web app exposes and
 * it is authenticated by a shared secret alone, so each assertion below stands
 * for an attack the scheme is supposed to stop rather than for a code path.
 */

const SECRET = "invalidation-secret";

const EVENT: InvalidationEvent = {
  eventId: "event-1",
  locale: "en",
  reason: "publish",
  tags: ["public:article:hello:en", "public:articles:en"],
  issuedAt: "2026-08-16T12:00:00.000Z",
};

let nonces: MemoryNonceStore;

beforeEach(() => {
  nonces = new MemoryNonceStore();
});

function signed(
  overrides: {
    readonly body?: string;
    readonly secret?: string;
    readonly timestamp?: string;
    readonly nonce?: string;
    readonly signature?: string;
  } = {}
) {
  const body = overrides.body ?? JSON.stringify(EVENT);
  const timestamp =
    overrides.timestamp ?? Math.floor(Date.now() / 1000).toString();
  const nonce = overrides.nonce ?? "nonce-1";
  const bodySha256 = createHash("sha256").update(body, "utf8").digest("hex");
  const signature =
    overrides.signature ??
    createHmac("sha256", overrides.secret ?? SECRET)
      .update(
        invalidationSigningString({ timestamp, nonce, bodySha256 }),
        "utf8"
      )
      .digest("hex");

  return {
    rawBody: body,
    headers: new Headers({
      [INVALIDATION_HEADERS.signature]: signature,
      [INVALIDATION_HEADERS.timestamp]: timestamp,
      [INVALIDATION_HEADERS.nonce]: nonce,
    }),
  };
}

function verify(
  request: { rawBody: string; headers: Headers },
  now?: () => number
) {
  return verifyInvalidationRequest({
    ...request,
    secret: SECRET,
    nonces,
    ...(now ? { now } : {}),
  });
}

describe("verifyInvalidationRequest", () => {
  it("accepts a correctly signed event", () => {
    const result = verify(signed());

    expect(result.ok).toBe(true);
    expect(result.ok && result.event.tags).toEqual(EVENT.tags);
  });

  it("rejects a request signed with the wrong secret", () => {
    const result = verify(signed({ secret: "not-the-secret" }));

    expect(result).toEqual({ ok: false, rejection: "bad-signature" });
  });

  it("rejects a body swapped under a valid signature", () => {
    // The body digest is inside the signed string precisely so this fails. A
    // scheme that signed only the timestamp and nonce would accept it.
    const request = signed();
    const tampered = {
      ...request,
      rawBody: JSON.stringify({ ...EVENT, tags: ["public:articles:fa"] }),
    };

    expect(verify(tampered)).toEqual({ ok: false, rejection: "bad-signature" });
  });

  it("rejects a replayed request", () => {
    const request = signed();

    expect(verify(request).ok).toBe(true);
    expect(verify(request)).toEqual({ ok: false, rejection: "replayed-nonce" });
  });

  it("does not let a forged request burn a nonce", () => {
    // The nonce is claimed after the signature is checked. If it were claimed
    // first, anyone who knew the URL could lock out the real delivery that
    // follows by guessing nothing more than a nonce value.
    const forged = signed({ secret: "wrong", nonce: "nonce-shared" });
    expect(verify(forged)).toEqual({ ok: false, rejection: "bad-signature" });

    const genuine = signed({ nonce: "nonce-shared" });
    expect(verify(genuine).ok).toBe(true);
  });

  it("rejects a captured request replayed after the clock window", () => {
    const request = signed();
    const later = Date.now() + (INVALIDATION_CLOCK_SKEW_SECONDS + 60) * 1_000;

    expect(verify(request, () => later)).toEqual({
      ok: false,
      rejection: "stale-timestamp",
    });
  });

  it("rejects a timestamp from the future", () => {
    // A one-sided check would let a caller choosing its own timestamp mint a
    // request that stays valid far beyond the window.
    const request = signed();
    const earlier = Date.now() - (INVALIDATION_CLOCK_SKEW_SECONDS + 60) * 1_000;

    expect(verify(request, () => earlier)).toEqual({
      ok: false,
      rejection: "stale-timestamp",
    });
  });

  it("accepts a request inside the clock window", () => {
    const request = signed();
    const shortly = Date.now() + (INVALIDATION_CLOCK_SKEW_SECONDS - 30) * 1_000;

    expect(verify(request, () => shortly).ok).toBe(true);
  });

  it.each([
    INVALIDATION_HEADERS.signature,
    INVALIDATION_HEADERS.timestamp,
    INVALIDATION_HEADERS.nonce,
  ])("rejects a request missing %s", (header) => {
    const request = signed();
    request.headers.delete(header);

    expect(verify(request)).toEqual({
      ok: false,
      rejection: "missing-headers",
    });
  });

  it("rejects a non-numeric timestamp before doing any crypto", () => {
    expect(verify(signed({ timestamp: "not-a-number" }))).toEqual({
      ok: false,
      rejection: "malformed-timestamp",
    });
  });

  it("rejects a signed body that is not a valid event", () => {
    // Correctly signed and still refused: holding the secret does not grant
    // the ability to send arbitrary shapes into the purge path.
    const result = verify(signed({ body: JSON.stringify({ tags: [] }) }));

    expect(result).toEqual({ ok: false, rejection: "malformed-body" });
  });

  it("rejects a signed body that is not JSON at all", () => {
    expect(verify(signed({ body: "not json" }))).toEqual({
      ok: false,
      rejection: "malformed-body",
    });
  });

  it("rejects a signature of the wrong length without throwing", () => {
    // timingSafeEqual throws on differing lengths; the comparison hashes both
    // sides first so a short signature is a rejection, not a 500.
    expect(verify(signed({ signature: "ab" }))).toEqual({
      ok: false,
      rejection: "bad-signature",
    });
  });
});

describe("MemoryNonceStore", () => {
  it("allows a nonce again once its window has passed", () => {
    const store = new MemoryNonceStore();

    expect(store.claim("n1", Date.now() - 1)).toBe(true);
    // Expired on the sweep that the next write performs, so the map cannot
    // grow without bound across a long-running process.
    expect(store.claim("n2", Date.now() + 60_000)).toBe(true);
    expect(store.claim("n1", Date.now() + 60_000)).toBe(true);
  });

  it("refuses a nonce still inside its window", () => {
    const store = new MemoryNonceStore();
    const expiry = Date.now() + 60_000;

    expect(store.claim("n1", expiry)).toBe(true);
    expect(store.claim("n1", expiry)).toBe(false);
  });
});

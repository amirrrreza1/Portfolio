import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { dropCachedPublicTag } from "../../../server/public-api-client";
import {
  MemoryNonceStore,
  verifyInvalidationRequest,
} from "../../../server/invalidation-receiver";

/**
 * Signed cache invalidation from the API (API_SPEC.md §8).
 *
 * The only write-shaped route the public web app exposes. It is authenticated
 * by signature rather than by cookie, so it is deliberately outside any session
 * or CSRF concern — and for the same reason a browser must never be able to
 * reach it with ambient credentials, which is why nothing here reads a cookie
 * or reflects an origin.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Module-scoped so the replay window survives between requests in one process.
 *
 * It does not survive a restart and is not shared across replicas; the web app
 * has no database. The clock window is what bounds replay in those cases, which
 * is why it is narrow.
 */
const nonces = new MemoryNonceStore();

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CACHE_INVALIDATION_SECRET?.trim();
  if (!secret) {
    // Unconfigured is not "accept everything". A deployment without the secret
    // cannot verify anything, so it must refuse rather than purge on request.
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED" } },
      { status: 503 }
    );
  }

  // The raw text, not `request.json()`. The signature covers the bytes that
  // were sent, and re-serializing a parsed object produces a different string.
  const rawBody = await request.text();
  const verification = verifyInvalidationRequest({
    rawBody,
    headers: request.headers,
    secret,
    nonces,
  });

  if (!verification.ok) {
    // One status and no detail for every rejection. Telling a caller whether
    // the timestamp, the nonce, or the signature failed hands them an oracle
    // for probing the scheme. The reason is logged, not returned.
    console.warn(
      JSON.stringify({
        event: "invalidation-rejected",
        reason: verification.rejection,
      })
    );
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED" } },
      { status: 401 }
    );
  }

  for (const tag of verification.event.tags) {
    // Both layers, always. `revalidateTag` clears Next's fetch cache; the
    // in-process cache sits in front of it and would otherwise keep serving a
    // withdrawn article for the rest of its stale window.
    dropCachedPublicTag(tag);
    // `{ expire: 0 }` rather than a named cacheLife profile. Next 16 requires
    // the second argument, and every named profile schedules expiry instead of
    // forcing it. An unpublish that takes effect in an hour is not an
    // unpublish — this route exists precisely because the revalidate window is
    // too slow for a withdrawal.
    revalidateTag(tag, { expire: 0 });
  }

  return NextResponse.json({
    data: {
      eventId: verification.event.eventId,
      invalidated: verification.event.tags.length,
    },
  });
}

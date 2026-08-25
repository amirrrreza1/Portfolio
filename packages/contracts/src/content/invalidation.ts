import { z } from "zod";

import { localeSchema, type Locale } from "../common/locale.js";
import { isoTimestampSchema } from "../common/values.js";

/**
 * The signed cache-invalidation event from
 * [API_SPEC.md](../../../../docs/API_SPEC.md) §8 and
 * [SECURITY.md](../../../../docs/SECURITY.md) §6.
 *
 * This module holds only what both sides must agree on *exactly*: the tag
 * names, the event shape, and the byte string that gets signed. It contains no
 * cryptography, because `@portfolio/contracts` is imported by browser code and
 * the boundary test forbids `node:crypto` here for good reason.
 *
 * The split is deliberate rather than reluctant. The API signs and the web app
 * verifies, and those two jobs are genuinely asymmetric — only the verifier
 * needs a clock window and a replay store. What would actually drift between
 * two implementations is the canonical string: which fields, in what order,
 * with what separator. That is the part that lives here and is tested once.
 */

/**
 * Cache tags, constructed in exactly one place.
 *
 * The web app tags its `fetch` calls with these and the API names them in
 * invalidation events. They are a wire contract between two processes that
 * never share a call stack, so a mismatched string is not a type error — it is
 * an invalidation that silently does nothing and a page that stays stale until
 * its revalidate window lapses. Building them from a function means the two
 * sides cannot disagree without failing this package's tests.
 */
export function publicCacheTag(namespace: string, locale: Locale): string {
  return `public:${namespace}:${locale}`;
}

/** Namespaces that a publication or content transaction can invalidate. */
export const INVALIDATION_NAMESPACES = [
  "site",
  "home",
  "appearance",
  "projects",
  "articles",
] as const;

export type InvalidationNamespace = (typeof INVALIDATION_NAMESPACES)[number];

/**
 * A tag every article listing carries in addition to its own cache key.
 *
 * Listings are paginated, so their cache keys embed a limit and a cursor and
 * there is an unbounded number of them. The publisher cannot enumerate the
 * pages a reader happens to have warmed, so a per-key tag alone would mean a
 * new article never appears in any cached listing until its revalidate window
 * lapsed. Every listing read therefore registers this collective tag as well,
 * and one purge reaches all of them.
 *
 * This is the reason cache tags are built here rather than spelled at each
 * call site: the collective tag only works if the reader and the publisher
 * agree on it, and they are in different processes.
 */
export function articleListCacheTag(locale: Locale): string {
  return publicCacheTag("articles", locale);
}

/**
 * Tags affected by a change to one article translation.
 *
 * A published article changes its own page and the listings that mention it,
 * and nothing else. Purging the whole locale on every publish would be simpler
 * and would throw away the portfolio, appearance, and home caches for a change
 * that cannot affect them.
 */
export function articleCacheTags(input: {
  readonly locale: Locale;
  readonly slug: string;
}): readonly string[] {
  return [
    publicCacheTag(`article:${input.slug}`, input.locale),
    articleListCacheTag(input.locale),
  ];
}

export const invalidationEventSchema = z.object({
  /** Correlates the outbox row with the receiver's log. Not a secret. */
  eventId: z.string().trim().min(1).max(64),
  /**
   * Locale is part of every tag, so one language's publication never purges
   * the other (API_SPEC.md §8).
   */
  locale: localeSchema,
  reason: z.enum([
    "publish",
    "unpublish",
    "redirect",
    "resume-activate",
    "save",
  ]),
  /** Bounded: an event is a purge instruction, not a bulk-purge channel. */
  tags: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
  issuedAt: isoTimestampSchema,
});

export type InvalidationEvent = z.infer<typeof invalidationEventSchema>;

/** Header names, so a rename cannot land on one side only. */
export const INVALIDATION_HEADERS = {
  signature: "x-portfolio-signature",
  timestamp: "x-portfolio-timestamp",
  nonce: "x-portfolio-nonce",
} as const;

/**
 * How far apart the two clocks may be, in seconds.
 *
 * Narrow on purpose (SECURITY.md §6). The window is how long a captured
 * request stays replayable to a receiver that has lost its nonce store — after
 * a restart, for example — so it is the one bound that still holds when the
 * other defence is empty.
 */
export const INVALIDATION_CLOCK_SKEW_SECONDS = 300;

/**
 * The exact bytes both sides sign.
 *
 * Length-prefixed rather than joined with a separator. A plain `a.b.c` join is
 * ambiguous whenever a field can contain the separator: two different
 * (timestamp, nonce, digest) triples can produce one string, and a signature
 * over that string authenticates both. Prefixing each field with its byte
 * length removes the ambiguity regardless of what the fields contain.
 *
 * The body is passed as a digest rather than as bytes so the caller must have
 * already hashed exactly what it will send or did receive — the same
 * discipline required by any signed request body.
 */
export function invalidationSigningString(input: {
  readonly timestamp: string;
  readonly nonce: string;
  readonly bodySha256: string;
}): string {
  return [
    "portfolio-invalidation-v1",
    input.timestamp,
    input.nonce,
    input.bodySha256,
  ]
    .map((field) => `${field.length}:${field}`)
    .join("");
}

/** Rejection reasons, kept closed so logs are aggregatable. */
export const INVALIDATION_REJECTIONS = [
  "missing-headers",
  "malformed-timestamp",
  "stale-timestamp",
  "replayed-nonce",
  "bad-signature",
  "malformed-body",
] as const;

export type InvalidationRejection = (typeof INVALIDATION_REJECTIONS)[number];

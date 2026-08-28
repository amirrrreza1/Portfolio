import {
  type PublishBlocker,
  type PublishChecklist,
  type PublishWarning,
} from "./commands.js";

/**
 * Everything the checklist needs, gathered by the caller.
 *
 * The evaluator is pure and takes facts rather than a database handle for one
 * reason: the same checklist has to be computable for a body that has not been
 * saved yet. An author asking "can I publish this?" is asking about the draft
 * in front of them, and a checklist that could only read committed rows would
 * answer a question nobody asked.
 *
 * Every field is a fact, never a lookup. `unknownTags` is the tags that were
 * not found, not the tags that were requested — so a caller cannot pass the
 * request and have the evaluator quietly decide what "known" means.
 */
export interface ArticleChecklistFacts {
  readonly title: string;
  readonly excerpt: string | null;
  readonly seoDescription: string | null;
  readonly canonicalUrl: string | null;
  readonly coverImageId: string | null;
  readonly category: string | null;

  /** From `inspectArticleSource`, so a body that cannot render is still described. */
  readonly hasH1: boolean;
  readonly visibleTextLength: number;
  readonly wordCount: number;
  readonly unsafeUrls: readonly string[];
  readonly internalUrlCount: number;

  readonly categoryKnown: boolean;
  readonly unknownTags: readonly string[];
  /** A referenced cover or social image that is not verified, public, and live. */
  readonly mediaMissing: boolean;
  /** True when the cover image carries no alt text. Null when there is no cover. */
  readonly coverAltTextMissing: boolean | null;
  /** The slug is already taken in this locale by a different translation. */
  readonly slugTaken: boolean;
  /** The stored digest matches the stored body. False for an unimported legacy row. */
  readonly sourceIntegrityValid: boolean;
  /** The site's own origin, used to decide whether a canonical points away. */
  readonly siteOrigin: string | null;
  /** The other locale exists and is published. */
  readonly counterpartPublished: boolean;
}

/**
 * Below this, an article reads as a stub rather than a post. It is a warning,
 * not a blocker: a short post is a legitimate thing to publish, and the author
 * is the one who knows whether this one is finished.
 */
export const SHORT_BODY_WORD_COUNT = 120;

export function evaluateArticleChecklist(
  facts: ArticleChecklistFacts
): PublishChecklist {
  const blockers: PublishBlocker[] = [];
  const warnings: PublishWarning[] = [];

  if (facts.title.trim().length === 0) blockers.push("MISSING_TITLE");
  if ((facts.excerpt ?? "").trim().length === 0)
    blockers.push("MISSING_EXCERPT");
  if (facts.visibleTextLength === 0) blockers.push("EMPTY_BODY");

  // The page renders the article title as the document's only H1. A second one
  // in the body is not a style preference — it breaks the heading outline that
  // assistive technology navigates by, and the renderer refuses it outright.
  if (facts.hasH1) blockers.push("BODY_HAS_H1");

  if (facts.category !== null && !facts.categoryKnown) {
    blockers.push("UNKNOWN_CATEGORY");
  }
  if (facts.unknownTags.length > 0) blockers.push("UNKNOWN_TAG");
  if (facts.mediaMissing) blockers.push("MISSING_MEDIA");
  if (facts.coverAltTextMissing === true) blockers.push("COVER_WITHOUT_ALT");
  if (facts.slugTaken) blockers.push("SLUG_COLLISION");
  if (facts.unsafeUrls.length > 0) blockers.push("UNSAFE_LINK");
  if (!facts.sourceIntegrityValid) blockers.push("INVALID_SOURCE_INTEGRITY");

  if ((facts.seoDescription ?? "").trim().length === 0) {
    warnings.push("MISSING_SEO_DESCRIPTION");
  }
  if (facts.coverImageId === null) warnings.push("MISSING_COVER_IMAGE");
  if (pointsOffsite(facts.canonicalUrl, facts.siteOrigin)) {
    warnings.push("OFFSITE_CANONICAL");
  }
  if (facts.wordCount < SHORT_BODY_WORD_COUNT) warnings.push("SHORT_BODY");
  if (facts.internalUrlCount === 0) warnings.push("NO_INTERNAL_LINKS");
  if (!facts.counterpartPublished) warnings.push("UNTRANSLATED_COUNTERPART");

  return { blockers, warnings };
}

/**
 * A canonical URL that points at another origin tells search engines this is
 * not the authoritative copy. That is occasionally correct — a cross-post — and
 * usually a mistake, which is exactly what a warning is for.
 *
 * An unparseable canonical is not treated as offsite here; the frontmatter
 * schema already rejects one, and inventing a second answer would mean two
 * places decide what a valid URL is.
 */
function pointsOffsite(
  canonical: string | null,
  siteOrigin: string | null
): boolean {
  if (canonical === null || siteOrigin === null) return false;
  try {
    return new URL(canonical).origin !== new URL(siteOrigin).origin;
  } catch {
    return false;
  }
}

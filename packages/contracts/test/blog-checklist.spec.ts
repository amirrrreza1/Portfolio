import { describe, expect, it } from "vitest";

import {
  evaluateArticleChecklist,
  SHORT_BODY_WORD_COUNT,
  canPublish,
  warningsSatisfied,
  type ArticleChecklistFacts,
} from "../src/blog/index.js";

/** A translation that is genuinely ready: no blockers, no warnings. */
function ready(
  overrides: Partial<ArticleChecklistFacts> = {}
): ArticleChecklistFacts {
  return {
    title: "The theme token matrix",
    excerpt: "How the contrast matrix was built and what it caught.",
    seoDescription: "Building the contrast matrix.",
    canonicalUrl: "https://example.test/en/blog/theme-token-matrix",
    coverImageId: "1e0a5d3c-0000-4000-8000-000000000001",
    category: "engineering",
    hasH1: false,
    visibleTextLength: 4_000,
    wordCount: SHORT_BODY_WORD_COUNT + 10,
    unsafeUrls: [],
    internalUrlCount: 2,
    categoryKnown: true,
    unknownTags: [],
    mediaMissing: false,
    coverAltTextMissing: false,
    slugTaken: false,
    sourceIntegrityValid: true,
    siteOrigin: "https://example.test",
    counterpartPublished: true,
    ...overrides,
  };
}

describe("evaluateArticleChecklist", () => {
  it("raises nothing for a translation that is ready", () => {
    const checklist = evaluateArticleChecklist(ready());
    expect(checklist.blockers).toEqual([]);
    expect(checklist.warnings).toEqual([]);
    expect(canPublish(checklist)).toBe(true);
  });

  it.each([
    ["MISSING_TITLE", { title: "   " }],
    ["MISSING_EXCERPT", { excerpt: null }],
    ["EMPTY_BODY", { visibleTextLength: 0 }],
    ["BODY_HAS_H1", { hasH1: true }],
    ["UNKNOWN_CATEGORY", { categoryKnown: false }],
    ["UNKNOWN_TAG", { unknownTags: ["nonexistent"] }],
    ["MISSING_MEDIA", { mediaMissing: true }],
    ["COVER_WITHOUT_ALT", { coverAltTextMissing: true }],
    ["SLUG_COLLISION", { slugTaken: true }],
    ["UNSAFE_LINK", { unsafeUrls: ["javascript:alert(1)"] }],
    ["INVALID_SOURCE_INTEGRITY", { sourceIntegrityValid: false }],
  ] as const)("blocks on %s", (blocker, overrides) => {
    const checklist = evaluateArticleChecklist(ready(overrides));
    expect(checklist.blockers).toContain(blocker);
    expect(canPublish(checklist)).toBe(false);
  });

  it.each([
    ["MISSING_SEO_DESCRIPTION", { seoDescription: "  " }],
    ["MISSING_COVER_IMAGE", { coverImageId: null }],
    ["SHORT_BODY", { wordCount: SHORT_BODY_WORD_COUNT - 1 }],
    ["NO_INTERNAL_LINKS", { internalUrlCount: 0 }],
    ["UNTRANSLATED_COUNTERPART", { counterpartPublished: false }],
    [
      "OFFSITE_CANONICAL",
      { canonicalUrl: "https://someone-else.test/reprint" },
    ],
  ] as const)("warns on %s without blocking", (warning, overrides) => {
    const checklist = evaluateArticleChecklist(ready(overrides));
    expect(checklist.warnings).toContain(warning);
    expect(checklist.blockers).toEqual([]);
    expect(canPublish(checklist)).toBe(true);
  });

  it("does not call a missing cover a missing alt text", () => {
    // With no cover there is nothing to describe, so COVER_WITHOUT_ALT would
    // be a blocker the author could never clear.
    const checklist = evaluateArticleChecklist(
      ready({ coverImageId: null, coverAltTextMissing: null })
    );
    expect(checklist.blockers).not.toContain("COVER_WITHOUT_ALT");
    expect(checklist.warnings).toContain("MISSING_COVER_IMAGE");
  });

  it("treats a canonical on the site's own origin as onsite", () => {
    const checklist = evaluateArticleChecklist(
      ready({ canonicalUrl: "https://example.test/en/blog/other?utm=x" })
    );
    expect(checklist.warnings).not.toContain("OFFSITE_CANONICAL");
  });

  it("cannot decide a canonical is offsite with no site origin to compare", () => {
    const checklist = evaluateArticleChecklist(
      ready({ siteOrigin: null, canonicalUrl: "https://elsewhere.test/x" })
    );
    expect(checklist.warnings).not.toContain("OFFSITE_CANONICAL");
  });

  it("blocks a body that would not render at all", () => {
    // The renderer throws on an H1 and on an empty body, so these facts can
    // only come from a body that has never been rendered — which is exactly
    // the state the checklist exists to describe.
    const checklist = evaluateArticleChecklist(
      ready({ hasH1: true, visibleTextLength: 0, wordCount: 0 })
    );
    expect(checklist.blockers).toEqual(
      expect.arrayContaining(["EMPTY_BODY", "BODY_HAS_H1"])
    );
  });
});

describe("warningsSatisfied", () => {
  it("requires every raised warning to be acknowledged", () => {
    const checklist = evaluateArticleChecklist(
      ready({ coverImageId: null, seoDescription: null })
    );
    expect(warningsSatisfied(checklist, ["MISSING_COVER_IMAGE"])).toBe(false);
    expect(
      warningsSatisfied(checklist, [
        "MISSING_COVER_IMAGE",
        "MISSING_SEO_DESCRIPTION",
      ])
    ).toBe(true);
  });

  it("ignores an acknowledgement for a warning that is no longer raised", () => {
    const checklist = evaluateArticleChecklist(ready());
    expect(warningsSatisfied(checklist, ["SHORT_BODY"])).toBe(true);
  });
});

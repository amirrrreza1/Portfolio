import { describe, expect, it } from "vitest";

import {
  encodeSlugForUrl,
  isCanonicalSlug,
  localizedSlugSchema,
  normalizeSlug,
  SLUG_MAX_LENGTH,
  slugSchemaFor,
  suggestSlug,
} from "../src/common/slug.js";

/** Persian for "book", written with Persian keheh and yeh. */
const PERSIAN_BOOK = "کتاب";
/** The same word typed on an Arabic keyboard: Arabic kaf instead of keheh. */
const PERSIAN_BOOK_ARABIC_KAF = "كتاب";

describe("normalizeSlug — English", () => {
  it("lowercases and hyphenates", () => {
    expect(normalizeSlug("Hello World", "en")).toBe("hello-world");
  });

  it("turns punctuation into separators rather than deleting it", () => {
    // "reactnext" would silently merge two words into a term that means
    // something else.
    expect(normalizeSlug("React/Next", "en")).toBe("react-next");
  });

  it("reduces Latin accents to their base letters", () => {
    expect(normalizeSlug("Café Déjà Vu", "en")).toBe("cafe-deja-vu");
  });

  it("collapses repeated separators and trims the edges", () => {
    expect(normalizeSlug("  --Hello---World--  ", "en")).toBe("hello-world");
  });

  it("rejects nothing but produces an empty string for pure punctuation", () => {
    expect(normalizeSlug("!!! ???", "en")).toBe("");
  });

  it("drops non-Latin characters in an ASCII slug", () => {
    expect(normalizeSlug(`react ${PERSIAN_BOOK}`, "en")).toBe("react");
  });

  it("truncates without leaving a trailing hyphen", () => {
    const long = `${"a".repeat(SLUG_MAX_LENGTH - 1)}-bbbb`;
    const result = normalizeSlug(long, "en");

    expect(result.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(result.endsWith("-")).toBe(false);
  });

  it("is idempotent", () => {
    const once = normalizeSlug("Hello -- World!", "en");
    expect(normalizeSlug(once, "en")).toBe(once);
  });
});

describe("normalizeSlug — Persian", () => {
  it("preserves Persian letters", () => {
    expect(normalizeSlug(PERSIAN_BOOK, "fa")).toBe(PERSIAN_BOOK);
  });

  it("folds Arabic kaf to Persian keheh", () => {
    // The homograph case: identical on screen, different code points, and
    // without folding these become two rows with the same visible URL.
    expect(normalizeSlug(PERSIAN_BOOK_ARABIC_KAF, "fa")).toBe(PERSIAN_BOOK);
  });

  it("folds Arabic yeh and alef maksura to Persian yeh", () => {
    expect(normalizeSlug("ي", "fa")).toBe("ی");
    expect(normalizeSlug("ى", "fa")).toBe("ی");
  });

  it("folds Arabic-Indic digits to Persian digits", () => {
    expect(normalizeSlug("٠١٩", "fa")).toBe("۰۱۹");
  });

  it("removes zero-width non-joiners", () => {
    // ZWNJ is meaningful in Persian text and invisible in a URL, so two slugs
    // differing only by one would be indistinguishable to a reader.
    const withZwnj = `${PERSIAN_BOOK}‌${PERSIAN_BOOK}`;
    expect(normalizeSlug(withZwnj, "fa")).toBe(
      `${PERSIAN_BOOK}${PERSIAN_BOOK}`
    );
  });

  it("removes bidirectional override controls", () => {
    const withOverride = `‮${PERSIAN_BOOK}‬`;
    expect(normalizeSlug(withOverride, "fa")).toBe(PERSIAN_BOOK);
  });

  it("removes Arabic diacritics", () => {
    const withFatha = `كَتاب`;
    expect(normalizeSlug(withFatha, "fa")).toBe(PERSIAN_BOOK);
  });

  it("allows ASCII letters and hyphens alongside Persian", () => {
    expect(normalizeSlug(`react ${PERSIAN_BOOK}`, "fa")).toBe(
      `react-${PERSIAN_BOOK}`
    );
  });

  it("reduces decomposed Latin text embedded in a Persian slug", () => {
    // Persian slugs allow ASCII, so an accented Latin word inside one must
    // reduce to its base letters rather than losing them: "cafe", not "caf".
    const decomposed = "caf\u00E9".normalize("NFD");
    expect(normalizeSlug(decomposed, "fa")).toBe("cafe");
  });

  it("stores NFC: a further NFC pass over the output changes nothing", () => {
    const result = normalizeSlug(`${PERSIAN_BOOK_ARABIC_KAF} caf\u00E9`, "fa");
    expect(result.normalize("NFC")).toBe(result);
  });

  it("folds Arabic presentation forms to their base letters", () => {
    // U+FEDB is the initial-form Arabic kaf. It renders like kaf and is a
    // different code point, so it is another homograph route into a slug.
    expect(normalizeSlug("\uFEDB\u062A\u0627\u0628", "fa")).toBe(PERSIAN_BOOK);
  });

  it("is idempotent", () => {
    const once = normalizeSlug(`  ${PERSIAN_BOOK_ARABIC_KAF} -- test `, "fa");
    expect(normalizeSlug(once, "fa")).toBe(once);
  });
});

describe("isCanonicalSlug", () => {
  it("accepts canonical values", () => {
    expect(isCanonicalSlug("hello-world", "en")).toBe(true);
    expect(isCanonicalSlug(PERSIAN_BOOK, "fa")).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["Hello", "uppercase"],
    ["-hello", "leading hyphen"],
    ["hello-", "trailing hyphen"],
    ["hello--world", "repeated hyphen"],
    ["hello world", "space"],
    ["hello_world", "underscore"],
  ])("rejects %s (%s) for English", (value) => {
    expect(isCanonicalSlug(value, "en")).toBe(false);
  });

  it("rejects Persian characters in an English slug", () => {
    expect(isCanonicalSlug(PERSIAN_BOOK, "en")).toBe(false);
  });

  it("rejects an Arabic-kaf spelling as non-canonical", () => {
    expect(isCanonicalSlug(PERSIAN_BOOK_ARABIC_KAF, "fa")).toBe(false);
  });

  it("rejects a value over the length limit", () => {
    expect(isCanonicalSlug("a".repeat(SLUG_MAX_LENGTH + 1), "en")).toBe(false);
  });
});

describe("slugSchemaFor", () => {
  it("rejects rather than silently normalizing", () => {
    // Accepting and rewriting would publish a canonical URL the author never
    // chose, and the redirect history would record a slug that never existed.
    const result = slugSchemaFor("en").safeParse("Hello World");
    expect(result.success).toBe(false);
  });

  it("accepts an already-canonical slug", () => {
    expect(slugSchemaFor("en").safeParse("hello-world").success).toBe(true);
    expect(slugSchemaFor("fa").safeParse(PERSIAN_BOOK).success).toBe(true);
  });
});

describe("localizedSlugSchema", () => {
  it("validates the slug against its own locale", () => {
    expect(
      localizedSlugSchema.safeParse({ locale: "fa", slug: PERSIAN_BOOK })
        .success
    ).toBe(true);
    expect(
      localizedSlugSchema.safeParse({ locale: "en", slug: PERSIAN_BOOK })
        .success
    ).toBe(false);
  });

  it("rejects an unknown locale", () => {
    expect(
      localizedSlugSchema.safeParse({ locale: "de", slug: "hallo" }).success
    ).toBe(false);
  });
});

describe("encodeSlugForUrl", () => {
  it("leaves an ASCII slug untouched", () => {
    expect(encodeSlugForUrl("hello-world")).toBe("hello-world");
  });

  it("percent-encodes a Persian slug", () => {
    const encoded = encodeSlugForUrl(PERSIAN_BOOK);
    expect(encoded).toMatch(/^%/);
    expect(decodeURIComponent(encoded)).toBe(PERSIAN_BOOK);
  });
});

describe("suggestSlug", () => {
  it("reports when normalization changed the input", () => {
    expect(suggestSlug("Hello World", "en")).toEqual({
      slug: "hello-world",
      changed: true,
      empty: false,
    });
  });

  it("reports an unchanged title", () => {
    expect(suggestSlug("hello-world", "en").changed).toBe(false);
  });

  it("reports an empty result instead of inventing one", () => {
    // The migration must show the owner a collision report rather than
    // fabricate a slug for a title that normalizes to nothing.
    expect(suggestSlug("!!!", "en")).toEqual({
      slug: "",
      changed: true,
      empty: true,
    });
  });
});

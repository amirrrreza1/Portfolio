import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  DEFAULT_LOCALE,
  getTextDirection,
  isLocale,
  LOCALE_DEFINITIONS,
  LOCALES,
  localeSchema,
  localizedMapSchema,
  missingLocales,
  presentLocales,
} from "../src/common/locale.js";
import { resourceIdSchema, stableKeySchema } from "../src/common/ids.js";

describe("locale allowlist", () => {
  it("is exactly the reviewed set", () => {
    // Adding a locale is a code change plus a font and typography review. This
    // test is the tripwire that makes an accidental addition visible.
    expect(LOCALES).toEqual(["en", "fa"]);
  });

  it("has a definition for every locale", () => {
    for (const locale of LOCALES) {
      expect(LOCALE_DEFINITIONS[locale].locale).toBe(locale);
    }
  });

  it("marks Persian as right to left", () => {
    expect(getTextDirection("fa")).toBe("rtl");
    expect(getTextDirection("en")).toBe("ltr");
  });

  it("defaults to English", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });
});

describe("localeSchema", () => {
  it("accepts allowlisted locales", () => {
    expect(localeSchema.safeParse("fa").success).toBe(true);
  });

  it.each(["de", "EN", "en-US", "fa-IR", "", "  en  "])(
    "rejects %s without coercing",
    (value) => {
      // An unknown locale is VALIDATION_FAILED, never a fallback: serving the
      // wrong language quietly is worse than failing.
      expect(localeSchema.safeParse(value).success).toBe(false);
    }
  );
});

describe("isLocale", () => {
  it.each([null, undefined, 42, {}, "de"])("rejects %s", (value) => {
    expect(isLocale(value)).toBe(false);
  });

  it("accepts a known locale", () => {
    expect(isLocale("en")).toBe(true);
  });
});

describe("presentLocales and missingLocales", () => {
  it("reports which locales carry a value", () => {
    // Portfolio content falls back to English, so without this the admin panel
    // could not tell a translation from a fallback.
    expect(presentLocales({ en: "Hello" })).toEqual(["en"]);
    expect(missingLocales({ en: "Hello" })).toEqual(["fa"]);
  });

  it("treats blank strings as absent", () => {
    expect(presentLocales({ en: "Hello", fa: "   " })).toEqual(["en"]);
  });

  it("treats null and undefined as absent", () => {
    expect(presentLocales({ en: "Hello", fa: null })).toEqual(["en"]);
  });
});

describe("localizedMapSchema", () => {
  const schema = localizedMapSchema(z.string().min(1));

  it("requires the default locale", () => {
    expect(schema.safeParse({ fa: "سلام" }).success).toBe(false);
  });

  it("allows Persian to be absent", () => {
    expect(schema.safeParse({ en: "Hello" }).success).toBe(true);
  });
});

describe("resourceIdSchema", () => {
  it("accepts a UUID", () => {
    expect(
      resourceIdSchema.safeParse("3f2504e0-4f89-41d3-9a0c-0305e82c3301").success
    ).toBe(true);
  });

  it("accepts a CUID2", () => {
    expect(resourceIdSchema.safeParse("tz4a98xxat96iws9zmbrgj3a").success).toBe(
      true
    );
  });

  it.each(["1", "42", "abc", "", "3f2504e0-4f89-41d3-9a0c"])(
    "rejects %s",
    (value) => {
      // Sequence numbers are exactly what DATA_MODEL.md §2 keeps out of public
      // URLs, so a bare integer must not validate as an ID.
      expect(resourceIdSchema.safeParse(value).success).toBe(false);
    }
  );
});

describe("stableKeySchema", () => {
  it("accepts lowercase kebab-case", () => {
    expect(stableKeySchema.safeParse("blog-reading-surface").success).toBe(
      true
    );
  });

  it.each(["Hero", "hero_section", "-hero", "hero-", "2hero", "hero--section"])(
    "rejects %s",
    (value) => {
      expect(stableKeySchema.safeParse(value).success).toBe(false);
    }
  );
});

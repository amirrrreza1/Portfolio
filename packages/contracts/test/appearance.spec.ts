import { describe, expect, it } from "vitest";

import {
  type AppearanceSettings,
  appearanceRootAttributes,
  blogSurfaceAttributes,
  parseAppearanceCookie,
  PREFERENCES_VERSION,
  resolveAppearance,
  resolveSystemTheme,
  serializeAppearanceCookie,
} from "../src/appearance/preferences.js";
import { appearanceSettingsInputSchema } from "../src/appearance/settings.js";
import {
  fontsSupportingLocale,
  fontSupportsLocale,
} from "../src/appearance/registry.js";

const SETTINGS: AppearanceSettings = {
  enabledThemes: ["dark", "light"],
  defaultTheme: "dark",
  enabledBlogFonts: ["jetbrains-mono", "vazir-code", "system-sans"],
  defaultBlogFontByLocale: { en: "jetbrains-mono", fa: "vazir-code" },
  allowedBlogSizeSteps: ["sm", "md", "lg", "xl"],
  defaultBlogSizeStep: "md",
  offerMotionToggle: true,
};

describe("parseAppearanceCookie", () => {
  it("parses a well-formed cookie", () => {
    const raw = serializeAppearanceCookie({ theme: "light", blogSize: "lg" });
    expect(parseAppearanceCookie(raw)).toEqual({
      v: PREFERENCES_VERSION,
      theme: "light",
      blogSize: "lg",
    });
  });

  it("returns null for an absent cookie", () => {
    expect(parseAppearanceCookie(undefined)).toBeNull();
    expect(parseAppearanceCookie("")).toBeNull();
  });

  it.each([
    ["not json", "free text"],
    ['{"v":1,', "truncated json"],
    ['{"theme":"light"}', "missing version"],
    ['{"v":99,"theme":"light"}', "wrong version"],
    ['{"v":1,"theme":"neon"}', "unknown theme"],
    ['{"v":1,"blogFont":"comic-sans"}', "unknown font"],
    ['{"v":1,"blogSize":"9999"}', "unknown size"],
    ['{"v":1,"admin":true}', "unknown key"],
    ['["v",1]', "array"],
    ["null", "null literal"],
  ])("returns null for %s (%s)", (raw) => {
    // Never throws. This runs on every public request with a value the visitor
    // fully controls, so a parse failure must not become a 500.
    expect(parseAppearanceCookie(encodeURIComponent(raw))).toBeNull();
  });

  it("rejects an oversized cookie without parsing it", () => {
    const huge = encodeURIComponent(
      JSON.stringify({ v: 1, theme: "x".repeat(600) })
    );
    expect(parseAppearanceCookie(huge)).toBeNull();
  });

  it("round-trips through serialize and parse", () => {
    const preferences = {
      theme: "system",
      blogFont: "vazir-code",
      blogSize: "xl",
      motion: "reduced",
    } as const;

    expect(
      parseAppearanceCookie(serializeAppearanceCookie(preferences))
    ).toEqual({
      v: PREFERENCES_VERSION,
      ...preferences,
    });
  });
});

describe("resolveAppearance — the visitor's choice wins", () => {
  it("honours an enabled theme", () => {
    const cookie = parseAppearanceCookie(
      serializeAppearanceCookie({ theme: "light" })
    );
    const resolved = resolveAppearance(cookie, SETTINGS, "en");

    expect(resolved.theme).toBe("light");
    expect(resolved.corrected).toBe(false);
  });

  it("honours system as a theme even though it is not in enabledThemes", () => {
    const cookie = parseAppearanceCookie(
      serializeAppearanceCookie({ theme: "system" })
    );
    const resolved = resolveAppearance(cookie, SETTINGS, "en");

    expect(resolved.theme).toBe("system");
    expect(resolved.corrected).toBe(false);
  });

  it("falls back to the configured default when nothing is chosen", () => {
    const resolved = resolveAppearance(null, SETTINGS, "en");

    expect(resolved.theme).toBe("dark");
    expect(resolved.blogSize).toBe("md");
    expect(resolved.corrected).toBe(false);
  });
});

describe("resolveAppearance — the owner's allowlist wins", () => {
  it("ignores a theme the owner has disabled", () => {
    // The tampering case: an option that is not enabled cannot be selected by
    // crafting a cookie value.
    const settings: AppearanceSettings = {
      ...SETTINGS,
      enabledThemes: ["dark"],
    };
    const cookie = parseAppearanceCookie(
      serializeAppearanceCookie({ theme: "light" })
    );
    const resolved = resolveAppearance(cookie, settings, "en");

    expect(resolved.theme).toBe("dark");
    expect(resolved.corrected).toBe(true);
  });

  it("ignores a blog font the owner has disabled", () => {
    const settings: AppearanceSettings = {
      ...SETTINGS,
      enabledBlogFonts: ["vazir-code"],
      defaultBlogFontByLocale: { en: "vazir-code", fa: "vazir-code" },
    };
    const cookie = parseAppearanceCookie(
      serializeAppearanceCookie({ blogFont: "system-sans" })
    );
    const resolved = resolveAppearance(cookie, settings, "en");

    expect(resolved.blogFont).toBe("vazir-code");
    expect(resolved.corrected).toBe(true);
  });

  it("ignores a size step outside the allowed set", () => {
    const settings: AppearanceSettings = {
      ...SETTINGS,
      allowedBlogSizeSteps: ["md", "lg"],
    };
    const cookie = parseAppearanceCookie(
      serializeAppearanceCookie({ blogSize: "xl" })
    );
    const resolved = resolveAppearance(cookie, settings, "en");

    expect(resolved.blogSize).toBe("md");
    expect(resolved.corrected).toBe(true);
  });

  it("ignores a motion preference when the toggle is not offered", () => {
    const settings: AppearanceSettings = {
      ...SETTINGS,
      offerMotionToggle: false,
    };
    const cookie = parseAppearanceCookie(
      serializeAppearanceCookie({ motion: "full" })
    );
    const resolved = resolveAppearance(cookie, settings, "en");

    expect(resolved.motion).toBe("system");
    expect(resolved.corrected).toBe(true);
  });
});

describe("resolveAppearance — script compatibility", () => {
  it("refuses a Latin-only font for Persian even when it is enabled", () => {
    // jetbrains-mono is a legitimate site-wide option and still cannot set
    // Persian text; honouring it would render boxes.
    const cookie = parseAppearanceCookie(
      serializeAppearanceCookie({ blogFont: "jetbrains-mono" })
    );
    const resolved = resolveAppearance(cookie, SETTINGS, "fa");

    expect(resolved.blogFont).toBe("vazir-code");
    expect(resolved.corrected).toBe(true);
  });

  it("allows the same font for English", () => {
    const cookie = parseAppearanceCookie(
      serializeAppearanceCookie({ blogFont: "jetbrains-mono" })
    );
    const resolved = resolveAppearance(cookie, SETTINGS, "en");

    expect(resolved.blogFont).toBe("jetbrains-mono");
    expect(resolved.corrected).toBe(false);
  });

  it("falls back to a compatible font when the configured default is not", () => {
    // Defensive: write validation forbids this configuration, but the public
    // render path should not produce boxes if that rule was ever bypassed.
    const settings: AppearanceSettings = {
      ...SETTINGS,
      defaultBlogFontByLocale: { en: "jetbrains-mono", fa: "jetbrains-mono" },
    };
    const resolved = resolveAppearance(null, settings, "fa");

    expect(fontSupportsLocale(resolved.blogFont, "fa")).toBe(true);
  });

  it("only offers script-compatible fonts", () => {
    expect(fontsSupportingLocale("fa")).toEqual(["vazir-code", "system-sans"]);
    expect(fontsSupportingLocale("en")).toContain("jetbrains-mono");
  });
});

describe("resolveSystemTheme", () => {
  it("resolves system against the media query", () => {
    expect(resolveSystemTheme("system", true)).toBe("dark");
    expect(resolveSystemTheme("system", false)).toBe("light");
  });

  it("leaves an explicit choice alone", () => {
    expect(resolveSystemTheme("light", true)).toBe("light");
  });
});

describe("appearance attributes", () => {
  it("keeps blog typography off the root element", () => {
    // THEMING.md §1 and §5: data-blog-font and data-blog-size must never appear
    // on <html> or on non-blog pages. Separate functions make that boundary
    // hard to cross by accident.
    const resolved = resolveAppearance(null, SETTINGS, "en");
    const root = appearanceRootAttributes(resolved);

    expect(Object.keys(root)).toEqual(["data-theme", "data-motion"]);
    expect(Object.keys(blogSurfaceAttributes(resolved))).toEqual([
      "data-blog-font",
      "data-blog-size",
    ]);
  });
});

describe("appearanceSettingsInputSchema", () => {
  const valid = {
    enabledThemes: ["dark", "light"],
    defaultTheme: "dark",
    enabledBlogFonts: ["jetbrains-mono", "vazir-code"],
    defaultBlogFontByLocale: { en: "jetbrains-mono", fa: "vazir-code" },
    allowedBlogSizeSteps: ["sm", "md", "lg"],
    defaultBlogSizeStep: "md",
    offerMotionToggle: true,
  };

  it("accepts a valid configuration", () => {
    expect(appearanceSettingsInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a default theme outside the enabled set", () => {
    const result = appearanceSettingsInputSchema.safeParse({
      ...valid,
      enabledThemes: ["dark"],
      defaultTheme: "light",
    });
    expect(result.success).toBe(false);
  });

  it("accepts system as a default theme without enabling it", () => {
    expect(
      appearanceSettingsInputSchema.safeParse({
        ...valid,
        defaultTheme: "system",
      }).success
    ).toBe(true);
  });

  it("rejects disabling every theme", () => {
    expect(
      appearanceSettingsInputSchema.safeParse({ ...valid, enabledThemes: [] })
        .success
    ).toBe(false);
  });

  it("rejects leaving Persian with no script-compatible font", () => {
    // The invariant that is easiest to violate: the failure would otherwise
    // appear as boxes on the Persian blog, not as an error on this form.
    const result = appearanceSettingsInputSchema.safeParse({
      ...valid,
      enabledBlogFonts: ["jetbrains-mono"],
      defaultBlogFontByLocale: { en: "jetbrains-mono", fa: "jetbrains-mono" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a duplicated key", () => {
    expect(
      appearanceSettingsInputSchema.safeParse({
        ...valid,
        enabledThemes: ["dark", "dark"],
      }).success
    ).toBe(false);
  });

  it("rejects an unknown key in the payload", () => {
    expect(
      appearanceSettingsInputSchema.safeParse({ ...valid, customCss: "body{}" })
        .success
    ).toBe(false);
  });

  it("rejects a theme key that is not in the code registry", () => {
    expect(
      appearanceSettingsInputSchema.safeParse({
        ...valid,
        enabledThemes: ["dark", "midnight"],
      }).success
    ).toBe(false);
  });
});

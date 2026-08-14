import { z } from "zod";

import { localeSchema, LOCALES } from "../common/locale.js";
import { recordVersionSchema } from "../common/ids.js";
import { successEnvelopeSchema } from "../common/errors.js";
import {
  BLOG_FONTS,
  type BlogFontKey,
  blogFontKeySchema,
  blogSizeStepSchema,
  fontSupportsLocale,
  themeKeySchema,
  themePreferenceSchema,
} from "./registry.js";

/**
 * Write validation for the `AppearanceSettings` singleton, per
 * [THEMING.md](../../../../docs/THEMING.md) §7.
 *
 * Three invariants, all of which exist to prevent the owner from configuring a
 * site that cannot render:
 *
 * 1. every key must exist in the code registry — enforced by the enums;
 * 2. the default must be within the enabled set;
 * 3. at least one theme, and at least one script-compatible blog font per
 *    enabled locale, must remain enabled.
 *
 * The third is the one that is easy to miss. Disabling `vazir-code` while
 * Persian is enabled leaves no font that can render Persian text, and the
 * failure appears as boxes on the Persian blog rather than as an error on the
 * settings form.
 */

/** Ordered, unique key list. Order is the display order in the settings modal. */
function orderedKeys<T extends z.ZodType>(key: T, label: string) {
  return z
    .array(key)
    .min(1, `At least one ${label} must remain enabled.`)
    .refine(
      (keys) => new Set(keys).size === keys.length,
      `Each ${label} may appear only once.`
    );
}

export const appearanceSettingsInputSchema = z
  .object({
    enabledThemes: orderedKeys(themeKeySchema, "theme"),
    defaultTheme: themePreferenceSchema,
    enabledBlogFonts: orderedKeys(blogFontKeySchema, "blog font"),
    defaultBlogFontByLocale: z.object({
      en: blogFontKeySchema,
      fa: blogFontKeySchema,
    }),
    allowedBlogSizeSteps: orderedKeys(blogSizeStepSchema, "text size"),
    defaultBlogSizeStep: blogSizeStepSchema,
    offerMotionToggle: z.boolean(),
  })
  .strict()
  .superRefine((settings, ctx) => {
    // `system` is always selectable: it is a resolution mode, not a token set,
    // so it needs no entry in enabledThemes.
    if (
      settings.defaultTheme !== "system" &&
      !settings.enabledThemes.includes(settings.defaultTheme)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultTheme"],
        message: "The default theme must be one of the enabled themes.",
      });
    }

    if (!settings.allowedBlogSizeSteps.includes(settings.defaultBlogSizeStep)) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultBlogSizeStep"],
        message: "The default text size must be one of the allowed steps.",
      });
    }

    for (const locale of LOCALES) {
      const configured = settings.defaultBlogFontByLocale[locale];

      if (!settings.enabledBlogFonts.includes(configured)) {
        ctx.addIssue({
          code: "custom",
          path: ["defaultBlogFontByLocale", locale],
          message: `The default blog font for ${locale} must be one of the enabled fonts.`,
        });
      }

      if (!fontSupportsLocale(configured, locale)) {
        ctx.addIssue({
          code: "custom",
          path: ["defaultBlogFontByLocale", locale],
          message: `"${configured}" cannot render the ${locale} script.`,
        });
      }

      const hasCompatibleFont = settings.enabledBlogFonts.some(
        (key: BlogFontKey) => fontSupportsLocale(key, locale)
      );

      if (!hasCompatibleFont) {
        ctx.addIssue({
          code: "custom",
          path: ["enabledBlogFonts"],
          message: `At least one enabled blog font must be able to render the ${locale} script.`,
        });
      }
    }
  });

export type AppearanceSettingsInput = z.infer<
  typeof appearanceSettingsInputSchema
>;

/**
 * Admin update payload.
 *
 * `version` is the `If-Match` optimistic-concurrency token
 * ([API_SPEC.md](../../../../docs/API_SPEC.md) §3): a stale value returns `409`
 * and writes nothing.
 */
export const appearanceSettingsUpdateSchema = z.object({
  version: recordVersionSchema,
  settings: appearanceSettingsInputSchema,
});

export type AppearanceSettingsUpdate = z.infer<
  typeof appearanceSettingsUpdateSchema
>;

/**
 * The public `GET /public/:locale/appearance` DTO.
 *
 * Only what the settings modal needs to render its options. Deliberately no
 * `version`, no timestamps, and no per-locale map for other locales — a public
 * cache entry should not carry configuration the page cannot use.
 */
export const publicAppearanceSchema = z
  .object({
    locale: localeSchema,
    themes: z
      .array(themeKeySchema)
      .min(1)
      .refine((keys) => new Set(keys).size === keys.length, {
        message: "Enabled public themes must be unique.",
      }),
    defaultTheme: themePreferenceSchema,
    blogFonts: z
      .array(
        z
          .object({
            key: blogFontKeySchema,
            displayName: z.string().trim().min(1).max(120),
          })
          .strict()
      )
      .min(1)
      .refine(
        (fonts) => new Set(fonts.map((font) => font.key)).size === fonts.length,
        { message: "Enabled public blog fonts must be unique." }
      ),
    defaultBlogFont: blogFontKeySchema,
    blogSizes: z
      .array(blogSizeStepSchema)
      .min(1)
      .refine((steps) => new Set(steps).size === steps.length, {
        message: "Allowed public blog sizes must be unique.",
      }),
    defaultBlogSize: blogSizeStepSchema,
    offerMotionToggle: z.boolean(),
  })
  .strict()
  .superRefine((settings, context) => {
    if (
      settings.defaultTheme !== "system" &&
      !settings.themes.includes(settings.defaultTheme)
    ) {
      context.addIssue({
        code: "custom",
        path: ["defaultTheme"],
        message: "The default public theme must be enabled.",
      });
    }

    if (!settings.blogSizes.includes(settings.defaultBlogSize)) {
      context.addIssue({
        code: "custom",
        path: ["defaultBlogSize"],
        message: "The default public blog size must be allowed.",
      });
    }

    const enabledFontKeys = settings.blogFonts.map((font) => font.key);
    if (!enabledFontKeys.includes(settings.defaultBlogFont)) {
      context.addIssue({
        code: "custom",
        path: ["defaultBlogFont"],
        message: "The default public blog font must be enabled.",
      });
    }

    for (const [index, font] of settings.blogFonts.entries()) {
      if (!fontSupportsLocale(font.key, settings.locale)) {
        context.addIssue({
          code: "custom",
          path: ["blogFonts", index, "key"],
          message: `The font cannot render the ${settings.locale} script.`,
        });
      }
      if (BLOG_FONTS[font.key].displayName !== font.displayName) {
        context.addIssue({
          code: "custom",
          path: ["blogFonts", index, "displayName"],
          message: "The display name must come from the code registry.",
        });
      }
    }
  });

export const publicAppearanceEnvelopeSchema = successEnvelopeSchema(
  publicAppearanceSchema
).strict();

export type PublicAppearance = z.infer<typeof publicAppearanceSchema>;
export type PublicAppearanceEnvelope = z.infer<
  typeof publicAppearanceEnvelopeSchema
>;

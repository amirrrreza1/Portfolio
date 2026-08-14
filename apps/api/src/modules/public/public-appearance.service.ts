import {
  appearanceSettingsInputSchema,
  BLOG_FONTS,
  fontSupportsLocale,
  publicAppearanceSchema,
  type PublicAppearance,
} from "@portfolio/contracts/appearance";
import type { Locale } from "@portfolio/contracts/common";
import type { Database } from "@portfolio/database";

export interface PublicAppearanceRead {
  readonly data: PublicAppearance;
  readonly lastModified: Date;
}

/**
 * Locale-scoped projection of the owner-controlled appearance allowlist.
 * Registry display names come from code and only keys compatible with the
 * requested script reach the public settings modal.
 */
export class PublicAppearanceService {
  public constructor(private readonly database: Database) {}

  async read(locale: Locale): Promise<PublicAppearanceRead> {
    const row = await this.database.appearanceSettings.findUnique({
      where: { id: 1 },
      select: {
        enabledThemes: true,
        defaultTheme: true,
        enabledBlogFonts: true,
        defaultBlogFontByLocale: true,
        allowedBlogSizeSteps: true,
        defaultBlogSizeStep: true,
        offerMotionToggle: true,
        updatedAt: true,
      },
    });

    if (row === null) {
      throw new Error(
        "The public appearance settings singleton does not exist."
      );
    }

    const settings = appearanceSettingsInputSchema.parse({
      enabledThemes: row.enabledThemes,
      defaultTheme: row.defaultTheme,
      enabledBlogFonts: row.enabledBlogFonts,
      defaultBlogFontByLocale: row.defaultBlogFontByLocale,
      allowedBlogSizeSteps: row.allowedBlogSizeSteps,
      defaultBlogSizeStep: row.defaultBlogSizeStep,
      offerMotionToggle: row.offerMotionToggle,
    });
    const compatibleFonts = settings.enabledBlogFonts.filter((key) =>
      fontSupportsLocale(key, locale)
    );

    return {
      data: publicAppearanceSchema.parse({
        locale,
        themes: settings.enabledThemes,
        defaultTheme: settings.defaultTheme,
        blogFonts: compatibleFonts.map((key) => ({
          key,
          displayName: BLOG_FONTS[key].displayName,
        })),
        defaultBlogFont: settings.defaultBlogFontByLocale[locale],
        blogSizes: settings.allowedBlogSizeSteps,
        defaultBlogSize: settings.defaultBlogSizeStep,
        offerMotionToggle: settings.offerMotionToggle,
      }),
      lastModified: row.updatedAt,
    };
  }
}

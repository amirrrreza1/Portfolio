import type { Database } from "@portfolio/database";
import type { Locale } from "@portfolio/contracts/common";
import {
  publicPageSectionSchema,
  publicSiteSchema,
  type PublicPageSection,
  type PublicSite,
} from "@portfolio/contracts/portfolio";
import { renderInlineMarkdown } from "@portfolio/markdown";
import { z } from "zod";

export interface PublicSiteRead {
  readonly data: PublicSite;
  readonly lastModified: Date;
}

type Translation = {
  readonly locale: "en" | "fa";
  readonly updatedAt: Date;
};

const localizedLabelSchema = z
  .object({
    en: z.string().trim().min(1).max(200),
    fa: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

/**
 * Published site-shell read model. Secret settings and mutable record metadata
 * never enter the Prisma selection. The private birth date is the sole
 * non-public input and is consumed only to derive age; every flexible section
 * JSON payload is reconstructed through the key-specific strict public schema.
 */
export class PublicSiteService {
  public constructor(
    private readonly database: Database,
    private readonly now: () => Date = () => new Date()
  ) {}

  async read(locale: Locale): Promise<PublicSiteRead> {
    const locales =
      locale === "en" ? (["en"] as const) : (["fa", "en"] as const);

    const [settings, sectionRows, navigationRows, socialRows] =
      await Promise.all([
        this.database.siteSettings.findUnique({
          where: { id: 1 },
          select: {
            canonicalSiteUrl: true,
            defaultLocale: true,
            enabledLocales: true,
            authorName: true,
            creatorName: true,
            publisherName: true,
            searchConsoleTokens: true,
            contactEnabled: true,
            githubUsername: true,
            githubRepoAllowlist: true,
            githubCacheTtlSeconds: true,
            robotsAllowIndexing: true,
            birthDate: true,
            updatedAt: true,
            translations: {
              where: { locale: { in: [...locales] } },
              select: {
                locale: true,
                siteName: true,
                titleTemplate: true,
                metaDescription: true,
                keywords: true,
                footerLines: true,
                footerRights: true,
                resumeButtonLabel: true,
                updatedAt: true,
              },
            },
          },
        }),
        this.database.pageSection.findMany({
          where: { enabled: true, archivedAt: null },
          orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
          select: {
            key: true,
            content: true,
            updatedAt: true,
            translations: {
              where: { locale: { in: [...locales] } },
              select: {
                locale: true,
                title: true,
                content: true,
                updatedAt: true,
              },
            },
          },
        }),
        this.database.navItem.findMany({
          where: { enabled: true, archivedAt: null },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            id: true,
            labelByLocale: true,
            targetKind: true,
            target: true,
            iconKey: true,
            updatedAt: true,
          },
        }),
        this.database.socialLink.findMany({
          where: { enabled: true, archivedAt: null },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            id: true,
            labelByLocale: true,
            url: true,
            iconKey: true,
            rel: true,
            kind: true,
            updatedAt: true,
          },
        }),
      ]);

    if (settings === null) {
      throw new Error("The public site settings singleton does not exist.");
    }

    const settingsTranslation = resolveTranslation(
      settings.translations,
      locale
    );
    const age = ageFromBirthDate(settings.birthDate, this.now());
    const sections = await Promise.all(
      sectionRows.map(async (section) => {
        const english = resolveTranslation(section.translations, "en");
        const localized =
          locale === "en"
            ? english
            : section.translations.find(
                (translation) => translation.locale === locale
              );
        const title = nonEmptyText(localized?.title) ?? english.title;
        if (!title) {
          throw new Error(`Public section ${section.key} has no title.`);
        }
        return buildSection(
          section.key,
          title,
          section.content,
          english.content,
          localized?.content,
          age
        );
      })
    );

    const navigation = navigationRows.map((item) => ({
      id: item.id,
      label: resolveLabel(item.labelByLocale, locale),
      iconKey: item.iconKey,
      targetKind: item.targetKind,
      target: item.target,
    }));
    const socialLinks = socialRows.map((link) => ({
      id: link.id,
      label: resolveLabel(link.labelByLocale, locale),
      iconKey: link.iconKey,
      rel: link.rel,
      kind: link.kind,
      url: link.url,
    }));

    const data = publicSiteSchema.parse({
      locale,
      settings: {
        canonicalSiteUrl: settings.canonicalSiteUrl,
        defaultLocale: settings.defaultLocale,
        enabledLocales: settings.enabledLocales,
        siteName: settingsTranslation.siteName,
        titleTemplate: settingsTranslation.titleTemplate,
        metaDescription: settingsTranslation.metaDescription,
        keywords: settingsTranslation.keywords,
        footerLines: settingsTranslation.footerLines,
        footerRights: settingsTranslation.footerRights,
        resumeButtonLabel: settingsTranslation.resumeButtonLabel,
        siteVerification: publicVerificationTokens(
          settings.searchConsoleTokens
        ),
        authorName: settings.authorName,
        creatorName: settings.creatorName,
        publisherName: settings.publisherName,
        contactEnabled: settings.contactEnabled,
        githubUsername: settings.githubUsername,
        githubRepoAllowlist: settings.githubRepoAllowlist,
        githubCacheTtlSeconds: settings.githubCacheTtlSeconds,
        robotsAllowIndexing: settings.robotsAllowIndexing,
      },
      sections,
      navigation,
      socialLinks,
    });

    return {
      data,
      lastModified: latestDate([
        settings.updatedAt,
        ...settings.translations.map((translation) => translation.updatedAt),
        ...sectionRows.flatMap((section) => [
          section.updatedAt,
          ...section.translations.map((translation) => translation.updatedAt),
        ]),
        ...navigationRows.map((item) => item.updatedAt),
        ...socialRows.map((link) => link.updatedAt),
      ]),
    };
  }
}

function resolveTranslation<T extends Translation>(
  translations: readonly T[],
  locale: Locale
): T {
  const resolved =
    translations.find((translation) => translation.locale === locale) ??
    translations.find((translation) => translation.locale === "en");
  if (resolved === undefined) {
    throw new Error("Public site data is missing its English translation.");
  }
  return resolved;
}

function resolveLabel(value: unknown, locale: Locale): string {
  const labels = localizedLabelSchema.parse(value);
  return labels[locale] ?? labels.en;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

async function buildSection(
  key: string,
  title: string,
  baseInput: unknown,
  englishInput: unknown,
  localizedInput: unknown,
  age: number | null
): Promise<PublicPageSection> {
  const base = objectValue(baseInput, `Section ${key} content`);
  const english = objectValue(englishInput, `Section ${key} English content`);
  const localized =
    localizedInput === undefined
      ? {}
      : objectValue(localizedInput, `Section ${key} localized content`);

  switch (key) {
    case "hero": {
      const subtitle = localizedValue(localized.subtitle, english.subtitle);
      if (typeof subtitle === "string") await validateInline(subtitle);
      return publicPageSectionSchema.parse({
        key,
        title,
        content: {
          variant: base.variant,
          lines: localizedArray(localized.lines, english.lines),
          subtitle,
          typingSpeed: base.typingSpeed,
          deletingSpeed: base.deletingSpeed,
          pauseBetween: base.pauseBetween,
          showRubikCube: base.showRubikCube,
        },
      });
    }
    case "about": {
      const body = localizedArray(localized.body, english.body).map((value) =>
        interpolateAge(String(value), age)
      );
      await Promise.all(body.map(validateInline));
      return publicPageSectionSchema.parse({
        key,
        title,
        content: {
          location: localizedValue(localized.location, english.location),
          role: localizedValue(localized.role, english.role),
          body,
        },
      });
    }
    case "skills":
    case "projects":
    case "certificates":
      return publicPageSectionSchema.parse({ key, title, content: {} });
    case "contact":
      return publicPageSectionSchema.parse({
        key,
        title,
        content: {
          nameLabel: localizedValue(localized.nameLabel, english.nameLabel),
          namePlaceholder: localizedValue(
            localized.namePlaceholder,
            english.namePlaceholder
          ),
          emailLabel: localizedValue(localized.emailLabel, english.emailLabel),
          emailPlaceholder: localizedValue(
            localized.emailPlaceholder,
            english.emailPlaceholder
          ),
          messageLabel: localizedValue(
            localized.messageLabel,
            english.messageLabel
          ),
          messagePlaceholder: localizedValue(
            localized.messagePlaceholder,
            english.messagePlaceholder
          ),
          sendingLabel: localizedValue(
            localized.sendingLabel,
            english.sendingLabel
          ),
          submitLabel: localizedValue(
            localized.submitLabel,
            english.submitLabel
          ),
          successMessage: localizedValue(
            localized.successMessage,
            english.successMessage
          ),
          failureMessage: localizedValue(
            localized.failureMessage,
            english.failureMessage
          ),
          invalidNameMessage: localizedValue(
            localized.invalidNameMessage,
            english.invalidNameMessage
          ),
          invalidEmailMessage: localizedValue(
            localized.invalidEmailMessage,
            english.invalidEmailMessage
          ),
          invalidMessageMessage: localizedValue(
            localized.invalidMessageMessage,
            english.invalidMessageMessage
          ),
        },
      });
    default:
      throw new Error(`Unknown enabled public section key: ${key}`);
  }
}

function localizedValue(localized: unknown, english: unknown): unknown {
  return nonEmptyText(localized) ?? english;
}

function localizedArray(localized: unknown, english: unknown): unknown[] {
  return Array.isArray(localized) && localized.length > 0
    ? localized
    : Array.isArray(english)
      ? english
      : [];
}

function nonEmptyText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function interpolateAge(source: string, age: number | null): string {
  const unknownToken = /\{\{(?!age\}\})[^}]+\}\}/u.exec(source);
  if (unknownToken) {
    throw new Error(
      `Unknown public section template token ${unknownToken[0]}.`
    );
  }
  if (age === null) {
    return source.replace(/,\s*\{\{age\}\}\s+years old/u, "");
  }
  return source.replaceAll("{{age}}", String(age));
}

async function validateInline(source: string): Promise<void> {
  await renderInlineMarkdown(source);
}

function ageFromBirthDate(birthDate: Date | null, now: Date): number | null {
  if (birthDate === null) return null;
  const year = birthDate.getUTCFullYear();
  const month = birthDate.getUTCMonth();
  const day = birthDate.getUTCDate();
  let age = now.getUTCFullYear() - year;
  if (
    now.getUTCMonth() < month ||
    (now.getUTCMonth() === month && now.getUTCDate() < day)
  ) {
    age -= 1;
  }
  return age >= 0 && age <= 150 ? age : null;
}

function latestDate(values: readonly Date[]): Date {
  if (values.length === 0) return new Date(0);
  return new Date(Math.max(...values.map((value) => value.getTime())));
}

function publicVerificationTokens(value: unknown): {
  readonly google: string | null;
  readonly bing: string | null;
} {
  const record = objectValue(value ?? {}, "Search-console verification tokens");
  return {
    google: typeof record.google === "string" ? record.google : null,
    bing: typeof record.bing === "string" ? record.bing : null,
  };
}

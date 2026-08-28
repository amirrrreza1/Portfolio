import { z } from "zod";

import {
  httpsUrlSchema,
  internalPathSchema,
  localeSchema,
  mailtoUrlSchema,
  navItemIdSchema,
  socialLinkIdSchema,
  stableKeySchema,
  successEnvelopeSchema,
} from "../common/index.js";

const shortTextSchema = z.string().trim().min(1).max(200);
const proseSchema = z.string().trim().min(1).max(10_000);
const verificationTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^[\p{L}\p{N}._=-]+$/u)
  .nullable();

export const githubRepositoryNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^(?=.*[a-z\d])[a-z\d._-]+$/i, {
    message: "Must be a GitHub repository name, not a path or URL.",
  });

export const githubUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(39)
  .regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i);

/**
 * Canonical public origin. Production is HTTPS; localhost HTTP remains valid
 * so the deterministic seed can boot in a local environment.
 */
export const publicSiteOriginSchema = z
  .string()
  .trim()
  .max(2_048)
  .superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({ code: "custom", message: "Must be an absolute URL." });
      return;
    }

    const localHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !localHttp) {
      context.addIssue({
        code: "custom",
        message: "Must use https, except for a local development origin.",
      });
    }
    if (url.username || url.password) {
      context.addIssue({
        code: "custom",
        message: "Must not contain embedded credentials.",
      });
    }
    if (url.pathname !== "/" || url.search || url.hash) {
      context.addIssue({
        code: "custom",
        message: "Must contain only an origin.",
      });
    }
  });

export const publicSiteSettingsSchema = z
  .object({
    canonicalSiteUrl: publicSiteOriginSchema,
    defaultLocale: localeSchema,
    enabledLocales: z
      .array(localeSchema)
      .min(1)
      .max(2)
      .refine((locales) => new Set(locales).size === locales.length, {
        message: "Enabled locales must be unique.",
      }),
    siteName: shortTextSchema,
    titleTemplate: z.string().trim().min(1).max(240),
    metaDescription: z.string().trim().min(1).max(500),
    keywords: z.array(shortTextSchema).max(30),
    footerLines: z.array(shortTextSchema).max(6),
    footerRights: shortTextSchema,
    resumeButtonLabel: shortTextSchema,
    siteVerification: z
      .object({
        google: verificationTokenSchema,
        bing: verificationTokenSchema,
      })
      .strict(),
    authorName: shortTextSchema,
    creatorName: shortTextSchema,
    publisherName: shortTextSchema,
    contactEnabled: z.boolean(),
    githubUsername: githubUsernameSchema.nullable(),
    githubRepoAllowlist: z
      .array(githubRepositoryNameSchema)
      .max(100)
      .refine(
        (repositories) =>
          new Set(repositories.map((repository) => repository.toLowerCase()))
            .size === repositories.length,
        { message: "GitHub repository names must be unique." }
      ),
    githubCacheTtlSeconds: z.int().min(60).max(86_400),
    robotsAllowIndexing: z.boolean(),
  })
  .strict()
  .superRefine((settings, context) => {
    if (!settings.enabledLocales.includes(settings.defaultLocale)) {
      context.addIssue({
        code: "custom",
        path: ["defaultLocale"],
        message: "The default locale must be enabled.",
      });
    }
    if (
      settings.githubUsername === null &&
      settings.githubRepoAllowlist.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["githubRepoAllowlist"],
        message: "A GitHub username is required when repositories are enabled.",
      });
    }
  });

const publicHeroSectionSchema = z
  .object({
    key: z.literal("hero"),
    title: shortTextSchema,
    content: z
      .object({
        variant: z.literal("primary"),
        lines: z.array(shortTextSchema).min(1).max(12),
        subtitle: proseSchema.optional(),
        typingSpeed: z.int().min(10).max(500).optional(),
        deletingSpeed: z.int().min(10).max(500).optional(),
        pauseBetween: z.int().min(0).max(30_000).optional(),
        showRubikCube: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

const publicAboutSectionSchema = z
  .object({
    key: z.literal("about"),
    title: shortTextSchema,
    content: z
      .object({
        location: shortTextSchema,
        role: shortTextSchema,
        body: z.array(proseSchema).max(20),
      })
      .strict(),
  })
  .strict();

function emptyPublicSectionSchema(key: "skills" | "projects" | "certificates") {
  return z
    .object({
      key: z.literal(key),
      title: shortTextSchema,
      content: z.object({}).strict(),
    })
    .strict();
}

const publicContactSectionSchema = z
  .object({
    key: z.literal("contact"),
    title: shortTextSchema,
    content: z
      .object({
        nameLabel: shortTextSchema,
        namePlaceholder: shortTextSchema,
        emailLabel: shortTextSchema,
        emailPlaceholder: shortTextSchema,
        messageLabel: shortTextSchema,
        messagePlaceholder: shortTextSchema,
        sendingLabel: shortTextSchema,
        submitLabel: shortTextSchema,
        successMessage: shortTextSchema,
        failureMessage: shortTextSchema,
        invalidNameMessage: shortTextSchema,
        invalidEmailMessage: shortTextSchema,
        invalidMessageMessage: shortTextSchema,
      })
      .strict(),
  })
  .strict();

export const publicPageSectionSchema = z.discriminatedUnion("key", [
  publicHeroSectionSchema,
  publicAboutSectionSchema,
  emptyPublicSectionSchema("skills"),
  emptyPublicSectionSchema("projects"),
  emptyPublicSectionSchema("certificates"),
  publicContactSectionSchema,
]);

const publicNavBase = {
  id: navItemIdSchema,
  label: shortTextSchema,
  iconKey: stableKeySchema.nullable(),
};

export const publicNavItemSchema = z.discriminatedUnion("targetKind", [
  z
    .object({
      ...publicNavBase,
      targetKind: z.literal("SECTION_ANCHOR"),
      target: stableKeySchema,
    })
    .strict(),
  z
    .object({
      ...publicNavBase,
      targetKind: z.literal("INTERNAL_ROUTE"),
      target: internalPathSchema,
    })
    .strict(),
]);

const relSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)*$/)
  .nullable();

const publicSocialBase = {
  id: socialLinkIdSchema,
  label: shortTextSchema,
  iconKey: stableKeySchema.nullable(),
  rel: relSchema,
};

export const publicSocialLinkSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...publicSocialBase,
      kind: z.literal("SOCIAL"),
      url: httpsUrlSchema,
    })
    .strict(),
  z
    .object({
      ...publicSocialBase,
      kind: z.literal("DONATE"),
      url: httpsUrlSchema,
    })
    .strict(),
  z
    .object({
      ...publicSocialBase,
      kind: z.literal("EMAIL"),
      url: mailtoUrlSchema,
    })
    .strict(),
]);

export const publicSiteSchema = z
  .object({
    locale: localeSchema,
    settings: publicSiteSettingsSchema,
    sections: z.array(publicPageSectionSchema).max(32),
    navigation: z.array(publicNavItemSchema).max(64),
    socialLinks: z.array(publicSocialLinkSchema).max(64),
  })
  .strict();

export const publicSiteEnvelopeSchema =
  successEnvelopeSchema(publicSiteSchema).strict();

export type PublicSiteSettings = z.infer<typeof publicSiteSettingsSchema>;
export type PublicPageSection = z.infer<typeof publicPageSectionSchema>;
export type PublicNavItem = z.infer<typeof publicNavItemSchema>;
export type PublicSocialLink = z.infer<typeof publicSocialLinkSchema>;
export type PublicSite = z.infer<typeof publicSiteSchema>;
export type PublicSiteEnvelope = z.infer<typeof publicSiteEnvelopeSchema>;

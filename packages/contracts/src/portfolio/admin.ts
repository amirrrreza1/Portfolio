import { z } from "zod";

import {
  httpsUrlSchema,
  internalPathSchema,
  localeSchema,
  localizedMapSchema,
  mailtoUrlSchema,
  multilineTextSchema,
  normalizedEmailSchema,
  recordVersionSchema,
  sortOrderSchema,
  slugSchemaFor,
  stableKeySchema,
  trimmedTextSchema,
} from "../common/index.js";
import { appearanceSettingsInputSchema } from "../appearance/settings.js";
import {
  githubRepositoryNameSchema,
  githubUsernameSchema,
  publicSiteOriginSchema,
} from "./public-site.js";

/** Admin-only contracts for the first M7 vertical slice. */
const shortText = trimmedTextSchema({ max: 200 });
const prose = multilineTextSchema({ max: 10_000 });

export const adminSiteSettingsSchema = z
  .object({
    canonicalSiteUrl: publicSiteOriginSchema,
    defaultLocale: localeSchema,
    enabledLocales: z.array(localeSchema).min(1).max(2),
    timezone: z.string().trim().min(1).max(100),
    defaultSocialImageId: z.string().trim().min(1).max(64).nullable(),
    authorName: shortText,
    creatorName: shortText,
    publisherName: shortText,
    contactRecipientEmail: normalizedEmailSchema,
    contactEnabled: z.boolean(),
    contactRetentionDays: z.int().min(1).max(3650),
    githubUsername: githubUsernameSchema.nullable(),
    githubRepoAllowlist: z.array(githubRepositoryNameSchema).max(100),
    githubCacheTtlSeconds: z.int().min(60).max(86_400),
    robotsAllowIndexing: z.boolean(),
    birthDate: z.string().date().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabledLocales.includes(value.defaultLocale)) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultLocale"],
        message: "The default locale must be enabled.",
      });
    }
    if (new Set(value.enabledLocales).size !== value.enabledLocales.length) {
      ctx.addIssue({
        code: "custom",
        path: ["enabledLocales"],
        message: "Locales must be unique.",
      });
    }
    if (value.githubUsername === null && value.githubRepoAllowlist.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["githubRepoAllowlist"],
        message: "A GitHub username is required when repositories are enabled.",
      });
    }
  });

export const adminSiteSettingsUpdateSchema = z
  .object({
    settings: adminSiteSettingsSchema,
  })
  .strict();

export const adminSiteSettingsTranslationSchema = z
  .object({
    siteName: shortText,
    titleTemplate: trimmedTextSchema({ max: 240 }),
    metaDescription: prose.pipe(z.string().max(500)),
  })
  .strict();

export const adminAppearanceUpdateSchema = z
  .object({
    settings: appearanceSettingsInputSchema,
  })
  .strict();

const heroBaseSchema = z
  .object({
    variant: z.literal("primary"),
    typingSpeed: z.int().min(10).max(500).optional(),
    deletingSpeed: z.int().min(10).max(500).optional(),
    pauseBetween: z.int().min(0).max(30_000).optional(),
    showRubikCube: z.boolean().optional(),
  })
  .strict();
const heroTranslationSchema = z
  .object({
    title: shortText.nullable(),
    content: z
      .object({
        lines: z.array(shortText).min(1).max(12),
        subtitle: prose.optional(),
      })
      .strict(),
  })
  .strict();
const aboutBaseSchema = z.object({}).strict();
const aboutTranslationSchema = z
  .object({
    title: shortText.nullable(),
    content: z
      .object({
        location: shortText,
        role: shortText,
        body: z.array(prose).min(1).max(20),
      })
      .strict(),
  })
  .strict();
const collectionTranslationSchema = z
  .object({
    title: shortText.nullable(),
    content: z.object({}).strict(),
  })
  .strict();

export const adminSectionUpdateSchema = z.discriminatedUnion("key", [
  z
    .object({
      key: z.literal("hero"),
      content: heroBaseSchema,
      enabled: z.boolean(),
      sortOrder: sortOrderSchema,
    })
    .strict(),
  z
    .object({
      key: z.literal("about"),
      content: aboutBaseSchema,
      enabled: z.boolean(),
      sortOrder: sortOrderSchema,
    })
    .strict(),
  ...(["skills", "projects", "certificates", "contact"] as const).map((key) =>
    z
      .object({
        key: z.literal(key),
        content: z.object({}).strict(),
        enabled: z.boolean(),
        sortOrder: sortOrderSchema,
      })
      .strict()
  ),
]);

export const adminSectionTranslationSchema = z.discriminatedUnion("key", [
  z
    .object({ key: z.literal("hero"), translation: heroTranslationSchema })
    .strict(),
  z
    .object({ key: z.literal("about"), translation: aboutTranslationSchema })
    .strict(),
  ...(["skills", "projects", "certificates", "contact"] as const).map((key) =>
    z
      .object({ key: z.literal(key), translation: collectionTranslationSchema })
      .strict()
  ),
]);

const localizedLabel = localizedMapSchema(shortText, {
  requireDefaultLocale: true,
}).strict();
export const adminNavItemCreateSchema = z.discriminatedUnion("targetKind", [
  z
    .object({
      labelByLocale: localizedLabel,
      targetKind: z.literal("SECTION_ANCHOR"),
      target: stableKeySchema,
      iconKey: stableKeySchema.nullable(),
      enabled: z.boolean(),
      sortOrder: sortOrderSchema,
    })
    .strict(),
  z
    .object({
      labelByLocale: localizedLabel,
      targetKind: z.literal("INTERNAL_ROUTE"),
      target: internalPathSchema,
      iconKey: stableKeySchema.nullable(),
      enabled: z.boolean(),
      sortOrder: sortOrderSchema,
    })
    .strict(),
]);
export const adminNavItemUpdateSchema = adminNavItemCreateSchema;

const socialBase = {
  labelByLocale: localizedLabel,
  iconKey: stableKeySchema.nullable(),
  rel: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)*$/)
    .nullable(),
  enabled: z.boolean(),
  sortOrder: sortOrderSchema,
};
export const adminSocialLinkCreateSchema = z.discriminatedUnion("kind", [
  z
    .object({ ...socialBase, kind: z.literal("SOCIAL"), url: httpsUrlSchema })
    .strict(),
  z
    .object({ ...socialBase, kind: z.literal("DONATE"), url: httpsUrlSchema })
    .strict(),
  z
    .object({ ...socialBase, kind: z.literal("EMAIL"), url: mailtoUrlSchema })
    .strict(),
]);
export const adminSocialLinkUpdateSchema = adminSocialLinkCreateSchema;

export const adminSkillCategorySchema = z
  .object({
    key: stableKeySchema,
    enabled: z.boolean(),
    sortOrder: sortOrderSchema,
  })
  .strict();
export const adminSkillCategoryTranslationSchema = z
  .object({ name: shortText })
  .strict();
export const adminSkillSchema = z
  .object({
    categoryId: z.string().trim().min(1).max(64),
    name: trimmedTextSchema({ max: 120 }),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .transform((value) => value.toLowerCase()),
    iconMediaId: z.string().trim().min(1).max(64).nullable(),
    enabled: z.boolean(),
    sortOrder: sortOrderSchema,
  })
  .strict();
export const adminProjectSchema = z
  .object({
    slug: slugSchemaFor("en"),
    status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED", "ARCHIVED"]),
    demoUrl: httpsUrlSchema.nullable(),
    repositoryUrl: httpsUrlSchema.nullable(),
    imageId: z.string().trim().min(1).max(64).nullable(),
    featured: z.boolean(),
    enabled: z.boolean(),
    sortOrder: sortOrderSchema,
    startedAt: z.string().date().nullable(),
    completedAt: z.string().date().nullable(),
    skills: z
      .array(
        z
          .object({
            skillId: z.string().trim().min(1).max(64),
            sortOrder: sortOrderSchema,
          })
          .strict()
      )
      .max(250)
      .refine(
        (items) =>
          new Set(items.map((item) => item.skillId)).size === items.length,
        "Skills must be unique."
      ),
  })
  .strict();
export const adminProjectTranslationSchema = z
  .object({
    title: shortText,
    summary: prose.pipe(z.string().max(2_000)),
    longDescription: multilineTextSchema({ max: 512 * 1024 }).nullable(),
  })
  .strict();
export const adminCertificateSchema = z
  .object({
    issuerName: shortText,
    issuerUrl: httpsUrlSchema.nullable(),
    instructorName: shortText.nullable(),
    instructorUrl: httpsUrlSchema.nullable(),
    scoreText: trimmedTextSchema({ max: 100 }).nullable(),
    issuedAt: z.string().date(),
    credentialUrl: httpsUrlSchema.nullable(),
    mediaId: z.string().trim().min(1).max(64).nullable(),
    enabled: z.boolean(),
    sortOrder: sortOrderSchema,
  })
  .strict();
export const adminCertificateTranslationSchema = z
  .object({ title: shortText, description: prose.nullable() })
  .strict();
export const adminQuoteSchema = z
  .object({
    textByLocale: localizedMapSchema(prose, {
      requireDefaultLocale: true,
    }).strict(),
    author: shortText.nullable(),
    sourceUrl: httpsUrlSchema.nullable(),
    enabled: z.boolean(),
    pinned: z.boolean(),
    sortOrder: sortOrderSchema,
  })
  .strict();

export const versionedBodySchema = z
  .object({ version: recordVersionSchema })
  .strict();
export const archiveConfirmationSchema = z
  .object({ confirm: z.literal(true), version: recordVersionSchema })
  .strict();

export type AdminSiteSettingsUpdate = z.infer<
  typeof adminSiteSettingsUpdateSchema
>;
export type AdminSiteSettingsTranslation = z.infer<
  typeof adminSiteSettingsTranslationSchema
>;
export type AdminAppearanceUpdate = z.infer<typeof adminAppearanceUpdateSchema>;
export type AdminSectionUpdate = z.infer<typeof adminSectionUpdateSchema>;
export type AdminSectionTranslation = z.infer<
  typeof adminSectionTranslationSchema
>;
export type AdminNavItemCreate = z.infer<typeof adminNavItemCreateSchema>;
export type AdminSocialLinkCreate = z.infer<typeof adminSocialLinkCreateSchema>;
export type AdminSkillCategory = z.infer<typeof adminSkillCategorySchema>;
export type AdminSkillCategoryTranslation = z.infer<
  typeof adminSkillCategoryTranslationSchema
>;
export type AdminSkill = z.infer<typeof adminSkillSchema>;
export type AdminProject = z.infer<typeof adminProjectSchema>;
export type AdminProjectTranslation = z.infer<
  typeof adminProjectTranslationSchema
>;
export type AdminCertificate = z.infer<typeof adminCertificateSchema>;
export type AdminCertificateTranslation = z.infer<
  typeof adminCertificateTranslationSchema
>;
export type AdminQuote = z.infer<typeof adminQuoteSchema>;

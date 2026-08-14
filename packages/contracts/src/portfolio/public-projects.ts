import { z } from "zod";

import {
  hexColorSchema,
  httpsUrlSchema,
  internalPathSchema,
  isoDateSchema,
  localeSchema,
  projectIdSchema,
  slugSchemaFor,
  skillCategoryIdSchema,
  skillIdSchema,
  stableKeySchema,
  successEnvelopeSchema,
} from "../common/index.js";

/**
 * Published-only DTOs for `GET /api/v1/public/:locale/projects`.
 *
 * Every object is strict by design. The Next.js server validates this schema
 * before caching a response, so adding a database/admin field accidentally
 * fails closed instead of turning a DTO change into a public data leak.
 */
export const publicSkillSchema = z
  .object({
    id: skillIdSchema,
    name: z.string().trim().min(1).max(120),
    color: hexColorSchema,
  })
  .strict();

export const publicSkillCategorySchema = z
  .object({
    id: skillCategoryIdSchema,
    key: stableKeySchema,
    name: z.string().trim().min(1).max(120),
    skills: z.array(publicSkillSchema).max(250),
  })
  .strict();

export const publicProjectStatusSchema = z.enum([
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
]);

export const publicProjectSlugSchema = slugSchemaFor("en");

export const publicProjectImageSchema = z
  .object({
    src: internalPathSchema.refine(
      (value) => !value.includes("?"),
      "Public image paths must not contain a query string."
    ),
    altText: z.string().trim().min(1).max(500),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    width: z.int().positive().max(20_000).nullable(),
    height: z.int().positive().max(20_000).nullable(),
  })
  .strict()
  .refine((value) => (value.width === null) === (value.height === null), {
    message:
      "Image width and height must either both be present or both be null.",
  });

export const publicProjectSchema = z
  .object({
    id: projectIdSchema,
    slug: z.string().trim().min(1).max(96),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(2_000),
    status: publicProjectStatusSchema,
    demoUrl: httpsUrlSchema.nullable(),
    repositoryUrl: httpsUrlSchema.nullable(),
    featured: z.boolean(),
    skillIds: z.array(skillIdSchema).max(250),
    image: publicProjectImageSchema.nullable(),
  })
  .strict();

export const publicProjectDetailItemSchema = publicProjectSchema
  .extend({
    longDescription: z
      .string()
      .trim()
      .min(1)
      .max(512 * 1024)
      .nullable(),
    startedAt: isoDateSchema.nullable(),
    completedAt: isoDateSchema.nullable(),
    skills: z.array(publicSkillSchema).max(250),
  })
  .strict();

export const publicProjectDetailSchema = z
  .object({
    locale: localeSchema,
    project: publicProjectDetailItemSchema,
  })
  .strict();

export const publicProjectsSchema = z
  .object({
    locale: localeSchema,
    projects: z.array(publicProjectSchema).max(500),
    skillCategories: z.array(publicSkillCategorySchema).max(100),
  })
  .strict();

export const publicProjectsEnvelopeSchema =
  successEnvelopeSchema(publicProjectsSchema).strict();

export const publicProjectDetailEnvelopeSchema = successEnvelopeSchema(
  publicProjectDetailSchema
).strict();

export type PublicSkill = z.infer<typeof publicSkillSchema>;
export type PublicSkillCategory = z.infer<typeof publicSkillCategorySchema>;
export type PublicProjectStatus = z.infer<typeof publicProjectStatusSchema>;
export type PublicProjectImage = z.infer<typeof publicProjectImageSchema>;
export type PublicProject = z.infer<typeof publicProjectSchema>;
export type PublicProjectDetailItem = z.infer<
  typeof publicProjectDetailItemSchema
>;
export type PublicProjectDetail = z.infer<typeof publicProjectDetailSchema>;
export type PublicProjects = z.infer<typeof publicProjectsSchema>;
export type PublicProjectsEnvelope = z.infer<
  typeof publicProjectsEnvelopeSchema
>;
export type PublicProjectDetailEnvelope = z.infer<
  typeof publicProjectDetailEnvelopeSchema
>;

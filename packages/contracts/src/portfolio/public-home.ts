import { z } from "zod";

import {
  certificateIdSchema,
  httpsUrlSchema,
  internalPathSchema,
  isoDateSchema,
  localeSchema,
  quoteIdSchema,
  successEnvelopeSchema,
  trimmedTextSchema,
} from "../common/index.js";

const shortTextSchema = trimmedTextSchema({ max: 240 });
const proseSchema = z.string().trim().min(1).max(10_000);
const optionalHttpsUrlSchema = httpsUrlSchema.nullable();

/** A safe download target routed through either the API or legacy web assets. */
export const publicDownloadPathSchema = internalPathSchema.refine(
  (value) => !value.includes("?"),
  "Public download paths must not contain a query string."
);

export const publicCertificateSchema = z
  .object({
    id: certificateIdSchema,
    title: shortTextSchema,
    description: proseSchema.nullable(),
    issuerName: shortTextSchema,
    issuerUrl: optionalHttpsUrlSchema,
    instructorName: shortTextSchema.nullable(),
    instructorUrl: optionalHttpsUrlSchema,
    scoreText: z.string().trim().min(1).max(120).nullable(),
    issuedAt: isoDateSchema,
    credentialUrl: optionalHttpsUrlSchema,
    downloadPath: publicDownloadPathSchema,
  })
  .strict();

export const publicQuoteSchema = z
  .object({
    id: quoteIdSchema,
    text: proseSchema,
    author: shortTextSchema.nullable(),
    sourceUrl: optionalHttpsUrlSchema,
  })
  .strict();

const publicFilenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[^\\/\u0000-\u001f\u007f]+$/, "Must be a safe filename.");

export const publicResumeSchema = z
  .object({
    label: shortTextSchema,
    filename: publicFilenameSchema,
    downloadPath: publicDownloadPathSchema,
  })
  .strict();

export const publicHomeSchema = z
  .object({
    locale: localeSchema,
    quote: publicQuoteSchema.nullable(),
    certificates: z.array(publicCertificateSchema).max(100),
    resume: publicResumeSchema.nullable(),
  })
  .strict();

export const publicHomeEnvelopeSchema =
  successEnvelopeSchema(publicHomeSchema).strict();

export type PublicCertificate = z.infer<typeof publicCertificateSchema>;
export type PublicQuote = z.infer<typeof publicQuoteSchema>;
export type PublicResume = z.infer<typeof publicResumeSchema>;
export type PublicHome = z.infer<typeof publicHomeSchema>;
export type PublicHomeEnvelope = z.infer<typeof publicHomeEnvelopeSchema>;

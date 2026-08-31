import { z } from "zod";

import { internalPathSchema } from "./values.js";

/**
 * The shape of a public image reference, defined once.
 *
 * Projects and articles both hand the browser the same thing: a site-relative
 * path served by the API's verified-media route, alt text, a MIME type from
 * the narrow set the ingestion boundary accepts, and dimensions that are
 * either both known or both unknown. Two copies of that rule would eventually
 * disagree — and the resource that ended up with the laxer copy would be the
 * one that shipped a query string, an unbounded MIME type, or a layout shift.
 *
 * `src` is site-relative rather than absolute on purpose. The public origin is
 * a deployment fact, not a content fact, and baking it into a cached DTO makes
 * every cached entry wrong the moment the site moves.
 */
export const publicImageSchema = z
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

export type PublicImage = z.infer<typeof publicImageSchema>;

import { z } from "zod";

import { recordVersionSchema } from "../common/ids.js";
import { isoTimestampSchema } from "../common/values.js";

/** SHA-256 of normalized UTF-8 authoritative Markdown. */
export const articleSourceSha256Schema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{64}$/, "Must be a lowercase SHA-256 digest.");

export type ArticleSourceSha256 = z.infer<typeof articleSourceSha256Schema>;

/** Stable 409 response for an optimistic article-version conflict. */
export const contentConflictSchema = z
  .object({
    expectedVersion: recordVersionSchema,
    currentVersion: recordVersionSchema,
    currentUpdatedAt: isoTimestampSchema.nullable(),
  })
  .strict();

export type ContentConflict = z.infer<typeof contentConflictSchema>;

export function hasValidArticleSource(input: {
  readonly bodyMarkdown: string | null;
  readonly bodySha256: string | null;
}): boolean {
  return (
    input.bodyMarkdown !== null &&
    input.bodyMarkdown.length > 0 &&
    articleSourceSha256Schema.safeParse(input.bodySha256).success
  );
}

import { z } from "zod";

import { localeSchema } from "../common/locale.js";
import { isCanonicalSlug, SLUG_MAX_LENGTH } from "../common/slug.js";
import { trimmedTextSchema } from "../common/values.js";

/**
 * Blog taxonomy, per [API_SPEC.md](../../../../docs/API_SPEC.md) §6
 * (`/admin/blog/categories`, `/admin/blog/tags`).
 *
 * **Taxonomy is never created implicitly.** `resolveTaxonomy` in the article
 * store refuses a category or tag that does not exist rather than making one,
 * because otherwise a typo in frontmatter silently becomes a category that
 * then appears in public navigation. These commands are the only way one comes
 * into being, which is what makes that refusal safe rather than merely strict.
 *
 * The stable identity is `key`: an opaque, locale-independent handle that
 * frontmatter references and that never appears in a URL. The per-locale
 * `slug` is what a visitor sees, and it can change without breaking a single
 * article's frontmatter.
 */
export const taxonomyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Must be lowercase alphanumeric words separated by single hyphens."
  );

export const adminTaxonomySchema = z
  .object({
    key: taxonomyKeySchema,
    enabled: z.boolean(),
    sortOrder: z.int().min(0).max(10_000),
  })
  .strict();

export type AdminTaxonomy = z.infer<typeof adminTaxonomySchema>;

/**
 * A slug is canonical *for its locale*, and the two locales disagree about
 * what canonical means — Persian slugs are Persian letters, English ones are
 * ASCII. So the translation schema is a function of the locale it is being
 * written for; there is no locale-agnostic taxonomy slug to validate.
 */
export function adminTaxonomyTranslationSchemaFor(locale: "en" | "fa") {
  return z
    .object({
      name: trimmedTextSchema({ max: 80 }),
      slug: z
        .string()
        .min(1)
        .max(SLUG_MAX_LENGTH)
        .refine((value) => isCanonicalSlug(value, locale), {
          message: "Slug is not in canonical form for its locale.",
        }),
      description: trimmedTextSchema({ max: 300 }).nullable(),
    })
    .strict();
}

export type AdminTaxonomyTranslation = z.infer<
  ReturnType<typeof adminTaxonomyTranslationSchemaFor>
>;

/**
 * Archiving a taxonomy row is `enabled: false`, not a delete.
 *
 * A category is referenced by every post that ever used it, and `Category` is
 * `onDelete: Restrict` for exactly that reason. Disabling removes it from
 * public discovery while leaving the articles that reference it intact and
 * republishable, which is what an author almost always means.
 */
export const adminTaxonomyLocalePathSchema = z
  .object({ locale: localeSchema })
  .strict();

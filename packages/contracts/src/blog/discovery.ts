import { z } from "zod";

import {
  cursorSchema,
  isoTimestampSchema,
  localeSchema,
  responseMetaSchema,
  stableKeySchema,
} from "../common/index.js";
import { isCanonicalSlug, SLUG_MAX_LENGTH } from "../common/slug.js";
import { trimmedTextSchema } from "../common/values.js";
import {
  EXCERPT_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from "../content/frontmatter.js";
import {
  publicArticleAlternateSchema,
  publicArticleSummarySchema,
} from "./public.js";

/**
 * Published-only DTOs for the blog discovery surfaces in
 * [API_SPEC.md](../../../../docs/API_SPEC.md) §4:
 * `/public/:locale/blog/categories/:slug`, `/public/:locale/blog/tags/:slug`,
 * and `/public/:locale/blog/feed-index`.
 *
 * These are read models for *navigation*, and the rule that shapes all three
 * is the same one the article listing already obeys: a translation whose
 * source, digest, or render provenance cannot be trusted is not in them. A
 * discovery surface that lists an article the detail route refuses is worse
 * than one that omits it — it publishes a link to a `404`, and puts that link
 * in a sitemap a crawler will keep asking for.
 */

const rawTaxonomySlugSchema = z.string().trim().min(1).max(SLUG_MAX_LENGTH);

export const publicTaxonomyKindSchema = z.enum(["category", "tag"]);

export type PublicTaxonomyKind = z.infer<typeof publicTaxonomyKindSchema>;

/**
 * The taxonomy row a visitor is looking at.
 *
 * `key` travels alongside the localized `slug` and `name` because it is what
 * an article summary carries: `categoryKey` and `tagKeys` are stable,
 * locale-independent handles, and without the key here a consumer could not
 * match a listing entry to the taxonomy page it belongs to without a second
 * request.
 */
export const publicTaxonomySchema = z
  .object({
    kind: publicTaxonomyKindSchema,
    key: stableKeySchema,
    slug: rawTaxonomySlugSchema,
    name: trimmedTextSchema({ max: 80 }),
    description: trimmedTextSchema({ max: 300 }).nullable(),
    /**
     * Every locale in which this term has a page, including this one.
     *
     * A taxonomy page is a localized URL like any other, so it owes the same
     * reciprocal `hreflang` an article does. The set includes the current
     * locale so the page and any sitemap entry can be generated from one list
     * without either side remembering to add itself back in.
     */
    alternates: z.array(publicArticleAlternateSchema).max(2),
  })
  .strict();

/**
 * One term as the blog's navigation lists it.
 *
 * `articleCount` counts the translations that are actually discoverable in
 * this locale — published, unarchived, and integrity-valid — rather than
 * every row that references the term. A count that included an article the
 * detail route refuses would advertise a page as non-empty and then render it
 * empty, and a term whose count is zero is omitted from the index entirely
 * rather than published as a crawlable dead end.
 */
export const publicTaxonomySummarySchema = publicTaxonomySchema
  .extend({ articleCount: z.int().positive().max(100_000) })
  .strict();

export const publicBlogTaxonomyIndexSchema = z
  .object({
    locale: localeSchema,
    categories: z.array(publicTaxonomySummarySchema).max(200),
    tags: z.array(publicTaxonomySummarySchema).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    for (const group of ["categories", "tags"] as const) {
      for (const [index, term] of value[group].entries()) {
        if (!isCanonicalSlug(term.slug, value.locale)) {
          context.addIssue({
            code: "custom",
            path: [group, index, "slug"],
            message: "Taxonomy slug is not canonical for the response locale.",
          });
        }
      }
    }
  });

export const publicBlogTaxonomyIndexEnvelopeSchema = z
  .object({
    data: publicBlogTaxonomyIndexSchema,
    meta: responseMetaSchema.strict(),
  })
  .strict();

export const publicArticleTaxonomyListSchema = z
  .object({
    locale: localeSchema,
    taxonomy: publicTaxonomySchema,
    posts: z.array(publicArticleSummarySchema).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (!isCanonicalSlug(value.taxonomy.slug, value.locale)) {
      context.addIssue({
        code: "custom",
        path: ["taxonomy", "slug"],
        message: "Taxonomy slug is not canonical for the response locale.",
      });
    }
    for (const [index, post] of value.posts.entries()) {
      if (!isCanonicalSlug(post.slug, value.locale)) {
        context.addIssue({
          code: "custom",
          path: ["posts", index, "slug"],
          message: "Article slug is not canonical for the response locale.",
        });
      }
    }
  });

export const publicArticleTaxonomyEnvelopeSchema = z
  .object({
    data: publicArticleTaxonomyListSchema,
    meta: responseMetaSchema
      .extend({ nextCursor: cursorSchema.nullable() })
      .strict(),
  })
  .strict();

/**
 * One entry as a feed or a sitemap needs it.
 *
 * Deliberately smaller than an article summary and deliberately different: it
 * carries `alternates`, which a listing does not, because a sitemap entry's
 * `xhtml:link` set must match the page's emitted `hreflang` set exactly
 * ([SEO.md](../../../../docs/SEO.md) §—sitemap). Generating the two from
 * different reads is how they drift apart, so they come from one.
 *
 * `excerpt` is the whole of the syndicated body. Shipping rendered HTML in a
 * feed means maintaining a second sanitization boundary for a consumer nobody
 * controls, and the product choice here is a summary feed that links back.
 */
export const publicFeedEntrySchema = z
  .object({
    slug: z.string().trim().min(1).max(SLUG_MAX_LENGTH),
    title: trimmedTextSchema({ max: TITLE_MAX_LENGTH }),
    excerpt: trimmedTextSchema({ max: EXCERPT_MAX_LENGTH }),
    publishedAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    authorName: trimmedTextSchema({ max: 200 }).nullable(),
    categoryKey: stableKeySchema.nullable(),
    tagKeys: z.array(stableKeySchema).max(10),
    alternates: z.array(publicArticleAlternateSchema).max(2),
  })
  .strict();

export const publicFeedIndexSchema = z
  .object({
    locale: localeSchema,
    entries: z.array(publicFeedEntrySchema).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [index, entry] of value.entries.entries()) {
      if (!isCanonicalSlug(entry.slug, value.locale)) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "slug"],
          message: "Feed entry slug is not canonical for the response locale.",
        });
      }
      if (
        !entry.alternates.some(
          (alternate) =>
            alternate.locale === value.locale && alternate.slug === entry.slug
        )
      ) {
        // A self-referential alternate is what makes the set usable as an
        // `hreflang` group: the page includes itself, so the sitemap and the
        // page metadata can be built from one list without either side
        // remembering to add the current locale back in.
        context.addIssue({
          code: "custom",
          path: ["entries", index, "alternates"],
          message: "A feed entry must include itself among its alternates.",
        });
      }
    }
  });

export const publicFeedIndexEnvelopeSchema = z
  .object({
    data: publicFeedIndexSchema,
    meta: responseMetaSchema
      .extend({ nextCursor: cursorSchema.nullable() })
      .strict(),
  })
  .strict();

export type PublicTaxonomy = z.infer<typeof publicTaxonomySchema>;
export type PublicTaxonomySummary = z.infer<typeof publicTaxonomySummarySchema>;
export type PublicBlogTaxonomyIndex = z.infer<
  typeof publicBlogTaxonomyIndexSchema
>;
export type PublicBlogTaxonomyIndexEnvelope = z.infer<
  typeof publicBlogTaxonomyIndexEnvelopeSchema
>;
export type PublicArticleTaxonomyList = z.infer<
  typeof publicArticleTaxonomyListSchema
>;
export type PublicArticleTaxonomyEnvelope = z.infer<
  typeof publicArticleTaxonomyEnvelopeSchema
>;
export type PublicFeedEntry = z.infer<typeof publicFeedEntrySchema>;
export type PublicFeedIndex = z.infer<typeof publicFeedIndexSchema>;
export type PublicFeedIndexEnvelope = z.infer<
  typeof publicFeedIndexEnvelopeSchema
>;

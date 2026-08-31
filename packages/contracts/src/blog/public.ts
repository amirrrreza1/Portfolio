import { z } from "zod";

import {
  cursorSchema,
  ERROR_MESSAGES,
  isoTimestampSchema,
  localeSchema,
  postIdSchema,
  publicImageSchema,
  responseMetaSchema,
  stableKeySchema,
  successEnvelopeSchema,
} from "../common/index.js";
import { isCanonicalSlug, SLUG_MAX_LENGTH } from "../common/slug.js";
import { httpsUrlSchema, trimmedTextSchema } from "../common/values.js";
import {
  EXCERPT_MAX_LENGTH,
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from "../content/frontmatter.js";

export const MAX_PUBLIC_ARTICLE_HTML_LENGTH = 4 * 1024 * 1024;

const rawArticleSlugSchema = z.string().trim().min(1).max(SLUG_MAX_LENGTH);

export const publicArticleHeadingSchema = z
  .object({
    depth: z.int().min(2).max(6),
    id: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .regex(/^[^\s"'<>#?]+$/u, "Heading ID is not a safe fragment."),
    text: trimmedTextSchema({ max: 200 }),
  })
  .strict();

export const publicArticleAlternateSchema = z
  .object({
    locale: localeSchema,
    slug: rawArticleSlugSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!isCanonicalSlug(value.slug, value.locale)) {
      context.addIssue({
        code: "custom",
        path: ["slug"],
        message: "Alternate slug is not canonical for its locale.",
      });
    }
  });

const publicArticleSummaryShape = {
  id: postIdSchema,
  slug: rawArticleSlugSchema,
  title: trimmedTextSchema({ max: TITLE_MAX_LENGTH }),
  excerpt: trimmedTextSchema({ max: EXCERPT_MAX_LENGTH }),
  publishedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  readingMinutes: z.int().positive().max(10_000),
  authorName: trimmedTextSchema({ max: 200 }).nullable(),
  categoryKey: stableKeySchema.nullable(),
  tagKeys: z.array(stableKeySchema).max(10),
  featured: z.boolean(),
} as const;

export const publicArticleSummarySchema = z
  .object(publicArticleSummaryShape)
  .strict();

export const publicArticleDetailItemSchema = z
  .object({
    ...publicArticleSummaryShape,
    seoTitle: trimmedTextSchema({ max: SEO_TITLE_MAX_LENGTH }).nullable(),
    seoDescription: trimmedTextSchema({
      max: SEO_DESCRIPTION_MAX_LENGTH,
    }).nullable(),
    canonicalUrl: httpsUrlSchema.nullable(),
    /**
     * The image a social card should use, already resolved.
     *
     * Two database columns can supply it — the translation's own
     * `socialImage` and the post's shared `coverMedia` — and the choice
     * between them is editorial, not presentational, so it is made once on the
     * server rather than in every consumer that wants an `og:image`. A
     * translation that names neither, or whose media is not verified and
     * public, carries `null`; the page then falls back to the site image
     * rather than emitting a card pointing at nothing.
     */
    socialImage: publicImageSchema.nullable(),
    renderedHtml: z.string().min(1).max(MAX_PUBLIC_ARTICLE_HTML_LENGTH),
    headings: z.array(publicArticleHeadingSchema).max(100),
    alternates: z.array(publicArticleAlternateSchema).max(2),
  })
  .strict();

export const publicArticleListSchema = z
  .object({
    locale: localeSchema,
    posts: z.array(publicArticleSummarySchema).max(100),
  })
  .strict()
  .superRefine((value, context) => {
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

export const publicArticleDetailSchema = z
  .object({
    locale: localeSchema,
    post: publicArticleDetailItemSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!isCanonicalSlug(value.post.slug, value.locale)) {
      context.addIssue({
        code: "custom",
        path: ["post", "slug"],
        message: "Article slug is not canonical for the response locale.",
      });
    }
  });

export const publicArticleListEnvelopeSchema = z
  .object({
    data: publicArticleListSchema,
    meta: responseMetaSchema
      .extend({ nextCursor: cursorSchema.nullable() })
      .strict(),
  })
  .strict();

export const publicArticleDetailEnvelopeSchema = successEnvelopeSchema(
  publicArticleDetailSchema
).strict();

export const publicArticleTranslationNotFoundSchema = z
  .object({
    error: z
      .object({
        code: z.literal("TRANSLATION_NOT_FOUND"),
        message: z.literal(ERROR_MESSAGES.TRANSLATION_NOT_FOUND),
        requestId: z.string().min(1),
      })
      .strict(),
    meta: responseMetaSchema
      .extend({
        availableTranslations: z.array(publicArticleAlternateSchema).max(2),
      })
      .strict(),
  })
  .strict();

export type PublicArticleHeading = z.infer<typeof publicArticleHeadingSchema>;
export type PublicArticleAlternate = z.infer<
  typeof publicArticleAlternateSchema
>;
export type PublicArticleSummary = z.infer<typeof publicArticleSummarySchema>;
export type PublicArticleDetailItem = z.infer<
  typeof publicArticleDetailItemSchema
>;
export type PublicArticleList = z.infer<typeof publicArticleListSchema>;
export type PublicArticleDetail = z.infer<typeof publicArticleDetailSchema>;
export type PublicArticleListEnvelope = z.infer<
  typeof publicArticleListEnvelopeSchema
>;
export type PublicArticleDetailEnvelope = z.infer<
  typeof publicArticleDetailEnvelopeSchema
>;
export type PublicArticleTranslationNotFound = z.infer<
  typeof publicArticleTranslationNotFoundSchema
>;

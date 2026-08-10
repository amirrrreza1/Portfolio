import { describe, expect, it } from "vitest";

import {
  checkPathAgreement,
  CURRENT_FRONTMATTER_VERSION,
  FRONTMATTER_KEY_ORDER,
  frontmatterSchema,
  parseContentPath,
} from "../src/content/frontmatter.js";

const POST_ID = "clx8k2p9q0000abcd1234efg";
const MEDIA_ID = "media01hq2v8x9y000000000";

/** A minimal document that must always validate. */
function valid(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: CURRENT_FRONTMATTER_VERSION,
    postId: POST_ID,
    locale: "en",
    title: "Rendering Markdown without shipping a renderer",
    slug: "rendering-markdown-server-side",
    excerpt: "A short original summary used for listings and RSS.",
    status: "draft",
    ...overrides,
  };
}

describe("frontmatter — shape", () => {
  it("accepts a minimal draft and fills defaults", () => {
    const result = frontmatterSchema.safeParse(valid());
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.tags).toEqual([]);
      expect(result.data.publishedAt).toBeNull();
      expect(result.data.canonicalUrl).toBeNull();
    }
  });

  it("rejects an unknown key rather than ignoring it", () => {
    // The failure this prevents: an author writes `draft: true`, the real field
    // is `status`, the unknown key is dropped, and the article publishes.
    expect(frontmatterSchema.safeParse(valid({ draft: true })).success).toBe(
      false
    );
  });

  it("rejects an unsupported schema version rather than guessing", () => {
    expect(
      frontmatterSchema.safeParse(valid({ schemaVersion: 2 })).success
    ).toBe(false);
  });

  it("rejects a non-opaque postId", () => {
    expect(frontmatterSchema.safeParse(valid({ postId: "42" })).success).toBe(
      false
    );
  });

  it("rejects an unknown locale", () => {
    expect(frontmatterSchema.safeParse(valid({ locale: "de" })).success).toBe(
      false
    );
  });

  it("rejects a title that is only whitespace", () => {
    expect(frontmatterSchema.safeParse(valid({ title: "   " })).success).toBe(
      false
    );
  });

  it("normalizes interior whitespace in the title", () => {
    const result = frontmatterSchema.safeParse(
      valid({ title: "  Hello   world  " })
    );
    expect(result.success && result.data.title).toBe("Hello world");
  });
});

describe("frontmatter — slug is validated against its own locale", () => {
  it("accepts a Persian slug for fa", () => {
    expect(
      frontmatterSchema.safeParse(valid({ locale: "fa", slug: "کتاب" })).success
    ).toBe(true);
  });

  it("rejects a Persian slug for en", () => {
    expect(frontmatterSchema.safeParse(valid({ slug: "کتاب" })).success).toBe(
      false
    );
  });

  it("rejects a non-canonical slug rather than normalizing it", () => {
    expect(
      frontmatterSchema.safeParse(valid({ slug: "Hello World" })).success
    ).toBe(false);
  });
});

describe("frontmatter — publication invariants", () => {
  it("rejects published with no publishedAt", () => {
    expect(
      frontmatterSchema.safeParse(valid({ status: "published" })).success
    ).toBe(false);
  });

  it("accepts published with publishedAt", () => {
    expect(
      frontmatterSchema.safeParse(
        valid({ status: "published", publishedAt: "2026-08-04T09:00:00Z" })
      ).success
    ).toBe(true);
  });

  it("rejects scheduled with no scheduledFor", () => {
    expect(
      frontmatterSchema.safeParse(valid({ status: "scheduled" })).success
    ).toBe(false);
  });

  it("rejects scheduled that also carries publishedAt", () => {
    expect(
      frontmatterSchema.safeParse(
        valid({
          status: "scheduled",
          scheduledFor: "2027-01-01T00:00:00Z",
          publishedAt: "2026-08-04T09:00:00Z",
        })
      ).success
    ).toBe(false);
  });

  it("rejects a draft carrying publishedAt", () => {
    expect(
      frontmatterSchema.safeParse(
        valid({ status: "draft", publishedAt: "2026-08-04T09:00:00Z" })
      ).success
    ).toBe(false);
  });

  it("allows archived to keep publishedAt", () => {
    // The redirect and canonical history depend on knowing when it was live.
    expect(
      frontmatterSchema.safeParse(
        valid({ status: "archived", publishedAt: "2026-08-04T09:00:00Z" })
      ).success
    ).toBe(true);
  });
});

describe("frontmatter — media and taxonomy", () => {
  it("requires alt text alongside a cover image", () => {
    expect(
      frontmatterSchema.safeParse(valid({ coverImage: MEDIA_ID })).success
    ).toBe(false);
  });

  it("accepts a cover image with alt text", () => {
    expect(
      frontmatterSchema.safeParse(
        valid({ coverImage: MEDIA_ID, coverImageAlt: "A terminal" })
      ).success
    ).toBe(true);
  });

  it("treats whitespace-only alt text as missing", () => {
    expect(
      frontmatterSchema.safeParse(
        valid({ coverImage: MEDIA_ID, coverImageAlt: "   " })
      ).success
    ).toBe(false);
  });

  it("rejects duplicate tags", () => {
    expect(
      frontmatterSchema.safeParse(valid({ tags: ["nextjs", "nextjs"] })).success
    ).toBe(false);
  });

  it("rejects a tag that is not a stable key", () => {
    expect(
      frontmatterSchema.safeParse(valid({ tags: ["Next JS"] })).success
    ).toBe(false);
  });

  it("rejects a non-https canonical URL", () => {
    expect(
      frontmatterSchema.safeParse(valid({ canonicalUrl: "http://x.com" }))
        .success
    ).toBe(false);
  });
});

describe("content path agreement", () => {
  it("parses a well-formed content path", () => {
    expect(parseContentPath(`content/blog/${POST_ID}/en.md`)).toEqual({
      postId: POST_ID,
      locale: "en",
    });
  });

  it("accepts .mdx as a path shape", () => {
    // The pipeline rejects executable MDX constructs during import; the path
    // itself is still recognizable.
    expect(parseContentPath(`content/blog/${POST_ID}/fa.mdx`)?.locale).toBe(
      "fa"
    );
  });

  it("rejects a path outside content/blog", () => {
    expect(parseContentPath(`content/pages/${POST_ID}/en.md`)).toBeNull();
    expect(parseContentPath(`../../etc/passwd`)).toBeNull();
  });

  it("reports agreement when path and frontmatter match", () => {
    expect(
      checkPathAgreement(`content/blog/${POST_ID}/en.md`, {
        postId: POST_ID,
        locale: "en",
      })
    ).toEqual([]);
  });

  it("reports a postId mismatch", () => {
    // The copy-paste case: without this, the frontmatter wins and the file
    // overwrites the article it was copied from.
    const mismatches = checkPathAgreement(`content/blog/other/en.md`, {
      postId: POST_ID,
      locale: "en",
    });

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.field).toBe("postId");
  });

  it("reports a locale mismatch", () => {
    const mismatches = checkPathAgreement(`content/blog/${POST_ID}/fa.md`, {
      postId: POST_ID,
      locale: "en",
    });

    expect(mismatches[0]?.field).toBe("locale");
  });
});

describe("deterministic serialization", () => {
  it("orders every frontmatter key", () => {
    // A no-op save must produce an empty diff, which requires a fixed key
    // order rather than JavaScript's insertion order.
    const parsed = frontmatterSchema.parse(valid());
    const keys = Object.keys(parsed).sort();
    const ordered = [...FRONTMATTER_KEY_ORDER].sort();

    expect(keys).toEqual(ordered);
  });

  it("lists no key twice", () => {
    expect(new Set(FRONTMATTER_KEY_ORDER).size).toBe(
      FRONTMATTER_KEY_ORDER.length
    );
  });
});

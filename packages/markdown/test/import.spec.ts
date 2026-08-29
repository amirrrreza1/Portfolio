import { describe, expect, it } from "vitest";

import { createArticleImportDiff, prepareArticleImport } from "../src/index.js";

const POST_ID = "clx8k2p9q0000abcd1234efg";

function upload(source: string, filename = "article.md") {
  return prepareArticleImport({
    bytes: new TextEncoder().encode(source),
    filename,
    expectedPostId: POST_ID,
    locale: "en",
    inferredPostId: "clx8k2p9q0000abcd1234efh",
  });
}

const valid = `---
schemaVersion: 1
postId: ${POST_ID}
locale: en
title: Safe import
slug: safe-import
status: draft
excerpt: A safe imported article.
---
## A section

The imported body has readable text.
`;

describe("prepareArticleImport", () => {
  it("normalizes a valid Markdown envelope deterministically", async () => {
    const result = await upload(valid.replace(/\n/gu, "\r\n"));

    expect(result.accepted).toBe(true);
    expect(result.article?.frontmatter.title).toBe("Safe import");
    expect(result.normalizedDocument).toContain("publishedAt: null\n");
    expect(result.normalizedDocument).not.toContain("\r");
  });

  it("accepts plain MDX as data and reports its conversion to Markdown", async () => {
    const result = await upload(valid, "article.mdx");

    expect(result.accepted).toBe(true);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "MDX_NORMALIZED_TO_MARKDOWN" })
    );
  });

  it.each([
    ["import Widget from './widget'", "MDX_IMPORT"],
    ["export const answer = 42", "MDX_EXPORT"],
    ["The answer is {answer}.", "MDX_EXPRESSION"],
    ['<Widget value="unsafe" />', "UNMAPPED_MDX_COMPONENT"],
  ])("rejects executable MDX with a line finding: %s", async (line, code) => {
    const result = await upload(`${valid}${line}\n`, "article.mdx");

    expect(result.accepted).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ severity: "error", code, line: 13 })
    );
  });

  it("infers and labels missing frontmatter instead of inventing it silently", async () => {
    const result = await upload(
      "# Imported title\n\nThe first paragraph becomes the excerpt.\n"
    );

    expect(result.accepted).toBe(true);
    expect(result.article?.frontmatter).toMatchObject({
      postId: POST_ID,
      locale: "en",
      title: "Imported title",
      slug: "imported-title",
      excerpt: "The first paragraph becomes the excerpt.",
      status: "draft",
    });
    expect(result.article?.body).not.toContain("# Imported title");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "INFERRED_TITLE", line: 1 })
    );
  });

  it("rejects invalid UTF-8 without replacement characters", async () => {
    const result = await prepareArticleImport({
      bytes: Uint8Array.from([0xc3, 0x28]),
      filename: "article.md",
      expectedPostId: POST_ID,
      locale: "en",
      inferredPostId: "clx8k2p9q0000abcd1234efh",
    });

    expect(result.accepted).toBe(false);
    expect(result.findings[0]?.code).toBe("INVALID_UTF8");
  });

  it("reports raw HTML at its uploaded line", async () => {
    const result = await upload(`${valid}<script>alert(1)</script>\n`);

    expect(result.accepted).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "RAW_HTML", line: 13 })
    );
  });
});

describe("createArticleImportDiff", () => {
  it("returns an empty diff for an unchanged normalized document", () => {
    expect(createArticleImportDiff(valid, valid)).toBe("");
  });

  it("shows the exact removed and added lines with bounded context", () => {
    const diff = createArticleImportDiff(
      "one\ntwo\nthree\n",
      "one\nnew\nthree\n"
    );
    expect(diff).toContain("-two");
    expect(diff).toContain("+new");
    expect(diff).toContain(" one");
    expect(diff).toContain(" three");
  });
});

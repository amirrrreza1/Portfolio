import { describe, expect, it } from "vitest";

import {
  MarkdownValidationError,
  parseArticle,
  renderArticle,
  renderInlineMarkdown,
  renderMarkdownBody,
  serializeArticle,
} from "../src/index.js";

const POST_ID = "clx8k2p9q0000abcd1234efg";

function article(body: string, overrides = ""): string {
  return [
    "---",
    "schemaVersion: 1",
    "postId: " + POST_ID,
    "locale: en",
    "title: Safe Markdown",
    "slug: safe-markdown",
    "excerpt: A compact description for the test article.",
    "status: draft",
    overrides.trimEnd(),
    "---",
    body,
    "",
  ].join("\n");
}

describe("article envelope", () => {
  it("round-trips frontmatter with byte-stable serialization", () => {
    const source = article("## A heading\n\nBody text.");
    const first = serializeArticle(parseArticle(source));
    const second = serializeArticle(parseArticle(first));

    expect(second).toBe(first);
    expect(first).toContain("tags: []");
    expect(first).toMatch(/\n$/);
  });

  it("rejects path/frontmatter disagreement", () => {
    expect(() =>
      parseArticle(article("Body."), "content/blog/" + POST_ID + "/fa.md")
    ).toThrow(MarkdownValidationError);
  });

  it("rejects YAML tags, aliases, duplicate keys, and oversized input", () => {
    expect(() =>
      parseArticle(article("Body.", "tags: &tags [safe]\n"))
    ).toThrow(/anchors, and aliases/);
    expect(() =>
      parseArticle(article("Body.", "title: second title\n"))
    ).toThrow();
    expect(() => parseArticle(article("x".repeat(512 * 1024)))).toThrow(
      /byte limit/
    );
  });
});

describe("full article renderer", () => {
  it("renders GFM, stable heading IDs, and safe external links", async () => {
    const result = await renderArticle(
      article(
        "## Same heading\n\nA [safe link](https://example.com).\n\n## Same heading\n\n| a | b |\n| - | - |\n| 1 | 2 |"
      )
    );

    expect(result.headings).toEqual([
      { depth: 2, id: "same-heading", text: "Same heading" },
      { depth: 2, id: "same-heading-2", text: "Same heading" },
    ]);
    expect(result.html).toContain('id="same-heading"');
    expect(result.html).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(result.html).toContain("<table>");
  });

  it("renders allowlisted directives and rejects unknown or malformed directives", async () => {
    const valid = await renderArticle(
      article(':::callout{type="tip" title="Useful"}\n\nKeep this.\n\n:::')
    );
    expect(valid.html).toContain("directive-callout");
    expect(valid.html).toContain("Keep this.");

    await expect(renderArticle(article("::unknown[nope]"))).rejects.toThrow(
      /not allowlisted/
    );
    await expect(
      renderArticle(article("::video{provider=evil id=abc123 title=x}"))
    ).rejects.toThrow(/provider must/);
  });

  it("rejects XSS, unsafe links, raw HTML, and level-one headings", async () => {
    await expect(
      renderArticle(article("[bad](javascript:alert(1))"))
    ).rejects.toThrow(/Unsafe link URL/);
    await expect(
      renderArticle(article("<script>alert(1)</script>"))
    ).rejects.toThrow(/Raw HTML/);
    await expect(
      renderArticle(article("# Author supplied H1"))
    ).rejects.toThrow(/H1/);
  });

  it("highlights known code and labels unknown languages without failing", async () => {
    const result = await renderArticle(
      article(
        "~~~ts\nconst answer: number = 42;\n~~~\n\n~~~not-a-language\nplain\n~~~"
      )
    );

    expect(result.html).toContain("language-known");
    expect(result.html).toContain("language-unknown");
  });
});

describe("standalone Markdown body renderer", () => {
  it("uses the same safe body pipeline without requiring frontmatter", async () => {
    const result = await renderMarkdownBody(
      "## Details\n\nA **safe** [link](https://example.com)."
    );

    expect(result.html).toContain('id="details"');
    expect(result.html).toContain("<strong>safe</strong>");
    expect(result.headings).toEqual([
      { depth: 2, id: "details", text: "Details" },
    ]);
  });

  it("rejects empty, raw HTML, unsafe URLs, and level-one headings", async () => {
    await expect(renderMarkdownBody("   ")).rejects.toThrow(/readable text/);
    await expect(renderMarkdownBody("<img src=x>")).rejects.toThrow(/Raw HTML/);
    await expect(
      renderMarkdownBody("[bad](javascript:alert(1))")
    ).rejects.toThrow(/Unsafe link URL/);
    await expect(renderMarkdownBody("# Duplicate page title")).rejects.toThrow(
      /H1/
    );
    await expect(
      renderMarkdownBody(':::callout{type="tip"}\n\nNot supported here.\n\n:::')
    ).rejects.toThrow(/Directive/);
  });
});

describe("restricted inline Markdown", () => {
  it("allows text formatting but rejects blocks, images, and directives", async () => {
    await expect(
      renderInlineMarkdown("Use **strong** and [a link](/projects).")
    ).resolves.toContain("<strong>strong</strong>");
    await expect(
      renderInlineMarkdown("![not allowed](/image.png)")
    ).rejects.toThrow(/image/);
    await expect(renderInlineMarkdown("## not allowed")).rejects.toThrow(
      /heading/
    );
    await expect(
      renderInlineMarkdown("[bad](javascript:alert(1))")
    ).rejects.toThrow(/Unsafe link URL/);
  });
});

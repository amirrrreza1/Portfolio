import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/app/[locale]"
);
const webSourceRoot = path.resolve(sourceRoot, "../..");

describe("blog typography boundary", () => {
  it("emits resolved preferences on article content only", async () => {
    const article = await readFile(
      path.join(sourceRoot, "blog/[slug]/page.tsx"),
      "utf8"
    );
    const articleContent = await readFile(
      path.join(webSourceRoot, "features/blog/ArticleContent.tsx"),
      "utf8"
    );

    expect(article).toContain("<ArticleReadingSurface");
    expect(article).toContain("font={appearance.blogFont}");
    expect(article).toContain("size={appearance.blogSize}");
    expect(articleContent).toContain('className="blog-reading-surface"');
    expect(articleContent).toContain("data-blog-font={font}");
    expect(articleContent).toContain("data-blog-size={size}");
    expect(article).toContain("getPortfolioAppearance(locale)");
  });

  it("keeps the complete article in a token-backed blurred reading shell", async () => {
    const css = await readFile(
      path.join(webSourceRoot, "app/globals.css"),
      "utf8"
    );

    expect(css).toContain("blog-article-shell");
    expect(css).toContain("background-color: var(--color-surface)");
    expect(css).toContain("backdrop-filter: blur(18px) saturate(125%)");
  });
});

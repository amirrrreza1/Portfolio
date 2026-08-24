import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/app/[locale]"
);

describe("blog typography boundary", () => {
  it("emits resolved preferences on article content only", async () => {
    const article = await readFile(
      path.join(sourceRoot, "blog/[slug]/page.tsx"),
      "utf8"
    );
    const project = await readFile(
      path.join(sourceRoot, "projects/[slug]/page.tsx"),
      "utf8"
    );

    expect(article).toContain('className="blog-reading-surface');
    expect(article).toContain("{...blogSurfaceAttributes(appearance)}");
    expect(article).toContain("getPortfolioAppearance(locale)");
    expect(project).not.toContain("blog-reading-surface");
  });
});

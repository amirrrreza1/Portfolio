import { describe, expect, it } from "vitest";

import { inspectArticleSource, renderArticleBody } from "../src/index.js";

describe("inspectArticleSource", () => {
  it("reports what the renderer would refuse instead of throwing", async () => {
    const source =
      "# A second H1\n\nSome text with [a bad link](javascript:alert(1)).";
    // The contrast is the point: the render path refuses this outright, which
    // is correct for a save and useless for a checklist.
    await expect(renderArticleBody(source)).rejects.toThrow();

    const inspection = inspectArticleSource(source);
    expect(inspection.hasH1).toBe(true);
    expect(inspection.unsafeUrls).toEqual(["javascript:alert(1)"]);
  });

  it("separates internal links from external ones", () => {
    const inspection = inspectArticleSource(
      [
        "Read [the other post](/en/blog/other) and [the spec](https://example.test/spec).",
        "",
        "Mail [me](mailto:owner@example.test).",
      ].join("\n")
    );
    expect(inspection.internalUrls).toEqual(["/en/blog/other"]);
    expect(inspection.urls).toHaveLength(3);
    expect(inspection.unsafeUrls).toEqual([]);
  });

  it("counts only visible text, not markup", () => {
    const empty = inspectArticleSource("   \n\n   ");
    expect(empty.visibleTextLength).toBe(0);
    expect(empty.wordCount).toBe(0);

    const real = inspectArticleSource("## Heading\n\nTwo words.");
    expect(real.visibleTextLength).toBeGreaterThan(0);
    expect(real.wordCount).toBe(4);
  });

  it("treats an http link as unsafe, because the renderer will not emit it", () => {
    // The sanitizer allows https and mailto only. An http link is not a
    // security problem by itself; it is a link that silently will not exist.
    const inspection = inspectArticleSource("[insecure](http://example.test)");
    expect(inspection.unsafeUrls).toEqual(["http://example.test"]);
  });

  it("finds image destinations as well as link destinations", () => {
    const inspection = inspectArticleSource("![alt](/media/cover.webp)");
    expect(inspection.internalUrls).toEqual(["/media/cover.webp"]);
  });
});

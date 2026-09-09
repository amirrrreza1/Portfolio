import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BLOG_FONT_KEYS,
  BLOG_FONTS,
  type BlogFontKey,
} from "@portfolio/contracts/appearance";
import { describe, expect, it } from "vitest";

import {
  blogFontPreloadHref,
  SITE_FONT_PRELOAD_HREF,
} from "../src/server/font-delivery";

/**
 * THEMING.md §4 font delivery rules, as far as a static scan can carry them.
 *
 * This file holds `globals.css`, `public/Fonts`, and `server/font-delivery.ts`
 * to each other: a declared face must exist, an existing file must be declared,
 * every face must carry a `unicode-range`, and only the two reviewed call sites
 * may name a font URL. The behavioural half — that a non-blog route issues no
 * request for an optional family, and that a blog preference reaches nothing
 * outside `.blog-reading-surface` — needs a rendered page and lives in
 * `e2e/appearance-matrix.spec.ts`.
 */

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const globalsCssPath = path.join(packageRoot, "src", "app", "globals.css");
const fontsDirectory = path.join(packageRoot, "public", "Fonts");

interface FontFace {
  readonly family: string;
  readonly href: string;
  readonly weight: string;
  readonly style: string;
  readonly display: string;
  readonly unicodeRange: string | null;
}

async function readDeclaredFaces(): Promise<FontFace[]> {
  const css = await readFile(globalsCssPath, "utf8");
  const faces: FontFace[] = [];

  for (const match of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = match[1];
    const value = (property: string): string | null =>
      body.match(new RegExp(`${property}\\s*:\\s*([^;]+);`))?.[1].trim() ??
      null;

    faces.push({
      family: (value("font-family") ?? "").replace(/"/g, ""),
      href: body.match(/url\("([^"]+)"\)/)?.[1] ?? "",
      weight: value("font-weight") ?? "",
      style: value("font-style") ?? "",
      display: value("font-display") ?? "",
      unicodeRange: value("unicode-range"),
    });
  }

  return faces;
}

/**
 * Weights the design can actually select.
 *
 * `font-medium`, `font-semibold`, and `font-bold` are the only weight utilities
 * in the source; `<strong>` in article Markdown resolves to 700; everything
 * else renders at 400. A face outside this set cannot be reached by any rule,
 * which is what made the other ten JetBrains Mono declarations dead weight.
 */
const SELECTABLE_WEIGHTS = new Set(["400", "500", "600", "700"]);

describe("web font declarations — THEMING.md §4", () => {
  it("declares exactly the faces that ship in public/Fonts", async () => {
    const faces = await readDeclaredFaces();
    const declared = faces.map((face) => path.basename(face.href)).sort();
    const shipped = (await readdir(fontsDirectory)).sort();

    // Both directions matter. A declaration with no file is a 404 on first
    // paint; a file with no declaration is repository weight no visitor can
    // ever request, which is exactly what the M5 reduction removed.
    expect(declared).toEqual(shipped);
  });

  it("declares only weights the design can select", async () => {
    const faces = await readDeclaredFaces();
    const unreachable = faces.filter(
      (face) => !SELECTABLE_WEIGHTS.has(face.weight)
    );

    expect(unreachable.map((face) => `${face.family} ${face.weight}`)).toEqual(
      []
    );
  });

  it("gives every face a unicode-range and a swap fallback", async () => {
    const faces = await readDeclaredFaces();
    expect(faces.length).toBeGreaterThan(0);

    for (const face of faces) {
      expect(face.unicodeRange, `${face.href} has no unicode-range`).not.toBe(
        null
      );
      expect(face.display, `${face.href} font-display`).toBe("swap");
      expect(face.href.endsWith(".woff2"), `${face.href} is not woff2`).toBe(
        true
      );
    }
  });

  it("keeps the Arabic range off the Latin family and on the Persian one", async () => {
    const faces = await readDeclaredFaces();
    // U+0600–06FF is where Persian text actually lives. A Latin face that
    // declared it would be fetched by every Persian page to render glyphs it
    // does not contain.
    const arabicBlock = /u\+06[0-9a-f]{2}/i;

    const latin = faces.filter((face) => face.family === "JetBrains_Mono");
    const persian = faces.filter((face) => face.family === "Shabnam");
    expect(latin.length).toBeGreaterThan(0);
    expect(persian.length).toBeGreaterThan(0);

    for (const face of latin) {
      expect(
        arabicBlock.test(face.unicodeRange ?? ""),
        `${face.href} declares an Arabic range`
      ).toBe(false);
    }
    expect(persian).toHaveLength(3);
    for (const face of persian) {
      expect(arabicBlock.test(face.unicodeRange ?? "")).toBe(true);
      // Zero-width non-joiner. Persian word forms are wrong without it.
      expect(face.unicodeRange).toContain("u+200c");
    }
  });
});

describe("blog typography scoping — THEMING.md §4", () => {
  it("uses Shabnam for Persian-language content", async () => {
    const css = await readFile(globalsCssPath, "utf8");

    expect(css).toMatch(
      /:lang\(fa\)\s*\{[^}]*font-family:\s*"Shabnam"/
    );
  });

  it("applies a blog preference only under .blog-reading-surface", async () => {
    const css = await readFile(globalsCssPath, "utf8");
    const offenders: string[] = [];

    for (const match of css.matchAll(/^([^\n{]*\[data-blog-[^\n{]*)\{/gm)) {
      const selector = match[1].trim();
      for (const part of selector.split(",")) {
        if (!part.trim().startsWith(".blog-reading-surface")) {
          offenders.push(part.trim());
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("gives every registry font a rule and every rule a registry font", async () => {
    const css = await readFile(globalsCssPath, "utf8");
    const styled = new Set(
      [...css.matchAll(/\[data-blog-font="([^"]+)"\]/g)].map(
        (match) => match[1]
      )
    );

    expect([...styled].sort()).toEqual([...BLOG_FONT_KEYS].sort());
  });
});

describe("font preloading — THEMING.md §4", () => {
  it("preloads a site face that is actually declared", async () => {
    const faces = await readDeclaredFaces();
    expect(faces.map((face) => face.href)).toContain(SITE_FONT_PRELOAD_HREF);
  });

  it("preloads nothing for a family that needs no download", () => {
    const systemStack = BLOG_FONT_KEYS.filter(
      (key) => !BLOG_FONTS[key].selfHosted
    );
    expect(systemStack.length).toBeGreaterThan(0);

    for (const key of systemStack) {
      expect(blogFontPreloadHref(key), key).toBe(null);
    }
  });

  it("never asks an article route to repeat the site font", () => {
    for (const key of BLOG_FONT_KEYS) {
      expect(blogFontPreloadHref(key as BlogFontKey), key).not.toBe(
        SITE_FONT_PRELOAD_HREF
      );
    }
  });

  it("preloads a declared face for every self-hosted family it does preload", async () => {
    const faces = await readDeclaredFaces();
    const hrefs = faces.map((face) => face.href);

    for (const key of BLOG_FONT_KEYS) {
      const href = blogFontPreloadHref(key as BlogFontKey);
      if (href === null) continue;
      expect(hrefs, `${key} preloads an undeclared face`).toContain(href);
    }
  });

  it("is the only place in the source that names a font file", async () => {
    const sourceRoot = path.join(packageRoot, "src");
    const allowed = new Set(["app/globals.css", "server/font-delivery.ts"]);
    const offenders: string[] = [];

    const walk = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(absolute);
          continue;
        }
        if (!/\.(?:ts|tsx|css)$/.test(entry.name)) continue;
        const name = path
          .relative(sourceRoot, absolute)
          .split(path.sep)
          .join("/");
        if (allowed.has(name)) continue;
        const contents = await readFile(absolute, "utf8");
        if (/\/Fonts\//.test(contents)) offenders.push(name);
      }
    };

    await walk(sourceRoot);
    expect(offenders).toEqual([]);
  });
});

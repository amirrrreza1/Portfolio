import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  THEME_KEYS,
  THEME_TOKEN_NAMES,
  THEME_TOKENS,
  type ThemeKey,
  type ThemeTokenName,
} from "@portfolio/contracts/appearance";
import { describe, expect, it } from "vitest";

/**
 * THEMING.md §3: "Components consume tokens only. A hard-coded colour in a
 * component is a defect; CI checks for raw hex values outside the token
 * declarations and asset files."
 *
 * This is that check. It runs under `pnpm test`, which is already in CI, rather
 * than as an ESLint rule — the offending values live inside `className` string
 * literals and Tailwind variant chains, which a lint rule would have to
 * re-lex, and the same scan has to cover `globals.css` anyway.
 */

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const sourceRoot = path.join(packageRoot, "src");
const globalsCss = path.join(sourceRoot, "app", "globals.css");

/**
 * Files allowed to name a colour directly, each for a reason that is not
 * "nobody got round to it".
 *
 * Adding to this list is a decision, not a formality: it means the colour is
 * outside the theme, so no theme change and no contrast check will ever reach
 * it.
 */
const RAW_COLOUR_ALLOWLIST = new Map<string, string>([
  [
    "Components/RubikCube/RubikCube.tsx",
    "The six Rubik's-cube face colours and the plastic body are the object's identity, not the site's palette. A cube whose red face followed the theme would not be a Rubik's cube.",
  ],
  [
    "proxy.ts",
    "A self-contained locale-negotiation error document served before any stylesheet exists. It cannot reference a token, and inlining the palette would give it a second copy to drift.",
  ],
  [
    "Utils/getTextColor.ts",
    "Returns the derived badge label for a stored skill colour. Black and white here are the output of the rule that `derivedLabelColor` in @portfolio/contracts reproduces, not a design choice.",
  ],
]);

/** Legacy token names the M5 migration retired. */
const RETIRED_TOKENS = ["Gold", "main-red", "main-green"] as const;

const RAW_COLOUR_PATTERN =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/;

/**
 * A Tailwind utility naming a palette colour or a retired token, with any
 * variant chain in front of it. `bg-white/20` and `dark:hover:bg-secondary`
 * both have to be caught, and both were real.
 */
const PALETTE_UTILITY_PATTERN = new RegExp(
  "(?:[a-z][a-z0-9-]*:)*" +
    "(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|shadow|divide|accent|caret)-" +
    "(?:white|black|" +
    RETIRED_TOKENS.join("|") +
    "|slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)" +
    "(?:-\\d{1,3})?(?:/\\d{1,3})?\\b",
  "g"
);

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(absolute)));
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(absolute);
    }
  }

  return files;
}

function relative(file: string): string {
  return path.relative(sourceRoot, file).split(path.sep).join("/");
}

/**
 * Reads one theme's declarations out of the CSS.
 *
 * `globals.css` states each token set four times — the two `[data-theme]` rules
 * and the two `prefers-color-scheme` fallbacks that cover the window before the
 * pre-paint script sets `data-system-theme`. Every occurrence is parsed, not
 * just the first, because a fallback copy drifting from its primary is exactly
 * the bug this file exists to catch and is invisible to anyone whose operating
 * system agrees with their site theme.
 */
function readDeclaredBlocks(
  css: string,
  theme: ThemeKey
): { selector: string; tokens: Record<string, string> }[] {
  const blocks: { selector: string; tokens: Record<string, string> }[] = [];
  const blockPattern = /([^{}]*?)\{([^{}]*)\}/g;

  for (const match of css.matchAll(blockPattern)) {
    const selector = match[1].trim().replace(/\s+/g, " ");
    const body = match[2];
    const mentionsTheme =
      selector.includes(`[data-theme="${theme}"]`) ||
      selector.includes(`[data-system-theme="${theme}"]`);
    if (!mentionsTheme || !body.includes("--color-")) {
      continue;
    }

    const tokens: Record<string, string> = {};
    for (const declaration of body.matchAll(
      /--color-([a-z-]+)\s*:\s*([^;]+);/g
    )) {
      tokens[declaration[1]] = declaration[2].trim();
    }
    blocks.push({ selector, tokens });
  }

  return blocks;
}

/**
 * The `system` fallbacks sit inside `@media (prefers-color-scheme: …)` and name
 * no theme in their selector, so they are found by their media condition.
 */
function readSystemFallback(
  css: string,
  scheme: "light" | "dark"
): Record<string, string> {
  const start = css.indexOf(`@media (prefers-color-scheme: ${scheme})`);
  expect(start, `no ${scheme} prefers-color-scheme block`).toBeGreaterThan(-1);
  const body = css.slice(start, css.indexOf("\n}", start));

  const tokens: Record<string, string> = {};
  for (const declaration of body.matchAll(
    /--color-([a-z-]+)\s*:\s*([^;]+);/g
  )) {
    tokens[declaration[1]] = declaration[2].trim();
  }
  return tokens;
}

describe("theme tokens in CSS", () => {
  it.each([...THEME_KEYS])(
    "declares %s exactly as @portfolio/contracts does",
    async (theme) => {
      const css = await readFile(globalsCss, "utf8");
      const blocks = readDeclaredBlocks(css, theme);

      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(
          Object.keys(block.tokens).sort(),
          `token set in ${block.selector}`
        ).toEqual([...THEME_TOKEN_NAMES].sort());

        for (const name of THEME_TOKEN_NAMES) {
          expect(
            block.tokens[name],
            `--color-${name} in ${block.selector}`
          ).toBe(THEME_TOKENS[theme][name as ThemeTokenName]);
        }
      }
    }
  );

  it.each([
    ["light", "light"],
    ["dark", "dark"],
  ] as const)(
    "keeps the %s prefers-color-scheme fallback equal to the %s theme",
    async (scheme, theme) => {
      const css = await readFile(globalsCss, "utf8");
      const fallback = readSystemFallback(css, scheme);

      expect(Object.keys(fallback).sort()).toEqual(
        [...THEME_TOKEN_NAMES].sort()
      );
      for (const name of THEME_TOKEN_NAMES) {
        expect(fallback[name], `--color-${name}`).toBe(
          THEME_TOKENS[theme][name as ThemeTokenName]
        );
      }
    }
  );

  it("scopes every media fallback to the window before the script resolves", async () => {
    // Without `:not([data-system-theme])` a media rule and the resolved rule
    // differ only in source order, and the resolved value is the one that has
    // to win once the pre-paint script has run.
    //
    // Asserted as a rule over every occurrence rather than as a count: the
    // token declarations are no longer the only thing that has to fall back
    // this way — the Shiki light/dark selection does too — and a count would
    // have to be edited every time another one is added, which is how an
    // unscoped fallback gets waved through.
    const css = await readFile(globalsCss, "utf8");
    const systemSelectors = [
      ...css.matchAll(/:root\[data-theme="system"\][^{,\s]*/g),
    ];
    expect(systemSelectors.length).toBeGreaterThan(0);

    const unscopedInsideMedia: string[] = [];
    const scopedOutsideMedia: string[] = [];

    for (const match of systemSelectors) {
      const preceding = css.slice(0, match.index);
      const mediaStart = preceding.lastIndexOf("@media (prefers-color-scheme:");
      const insideMedia =
        mediaStart > -1 &&
        // Still open: the block's closing brace is a line on its own.
        preceding.indexOf("\n}", mediaStart) === -1;
      const scoped = match[0].includes(":not([data-system-theme])");

      if (insideMedia && !scoped) unscopedInsideMedia.push(match[0]);
      if (!insideMedia && scoped) scopedOutsideMedia.push(match[0]);
    }

    expect(unscopedInsideMedia).toEqual([]);
    expect(scopedOutsideMedia).toEqual([]);
    expect(
      systemSelectors.filter((match) =>
        match[0].includes(":not([data-system-theme])")
      ).length
    ).toBeGreaterThanOrEqual(2);
  });

  it("registers every token with Tailwind as a reference, never a literal", async () => {
    const css = await readFile(globalsCss, "utf8");
    // The invariant is the `var()`. A literal in the @theme block is baked into
    // the generated utility, which pins that token to one theme and makes
    // `[data-theme]` stop working for it — visible as a single stubborn colour
    // rather than as a build failure.
    expect(css).toContain("@theme inline {");

    const start = css.indexOf("@theme inline {");
    const block = css.slice(start, css.indexOf("\n}", start));
    for (const name of THEME_TOKEN_NAMES) {
      if (name === "particle") {
        // Read through getPropertyValue on the canvas, never as a utility.
        continue;
      }
      expect(block, `@theme inline is missing --color-${name}`).toContain(
        `--color-${name}: var(--color-${name});`
      );
    }
  });
});

describe("components consume tokens only — THEMING.md §3", () => {
  it("names no raw colour outside the allowlist", async () => {
    const files = await collectSourceFiles(sourceRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const name = relative(file);
      if (RAW_COLOUR_ALLOWLIST.has(name)) {
        continue;
      }
      const contents = await readFile(file, "utf8");
      for (const [index, line] of contents.split("\n").entries()) {
        if (RAW_COLOUR_PATTERN.test(line)) {
          offenders.push(`${name}:${index + 1}  ${line.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("uses no Tailwind palette colour and no retired token", async () => {
    const files = await collectSourceFiles(sourceRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const contents = await readFile(file, "utf8");
      for (const [index, line] of contents.split("\n").entries()) {
        for (const match of line.matchAll(PALETTE_UTILITY_PATTERN)) {
          offenders.push(`${relative(file)}:${index + 1}  ${match[0]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the allowlist honest", async () => {
    // An entry that no longer has a raw colour in it is a stale exemption, and
    // a stale exemption is how the next one gets waved through.
    for (const [name] of RAW_COLOUR_ALLOWLIST) {
      const contents = await readFile(path.join(sourceRoot, name), "utf8");
      expect(
        RAW_COLOUR_PATTERN.test(contents),
        `${name} is allowlisted but names no raw colour`
      ).toBe(true);
    }
  });

  it("declares no retired token in the stylesheet either", async () => {
    const css = await readFile(globalsCss, "utf8");
    const declarations = css
      .split("\n")
      .filter((line) => /^\s*--color-/.test(line));

    for (const retired of RETIRED_TOKENS) {
      expect(
        declarations.some((line) => line.includes(`--color-${retired}:`)),
        `--color-${retired} is still declared`
      ).toBe(false);
    }
  });
});

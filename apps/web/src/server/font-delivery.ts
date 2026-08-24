import { BLOG_FONTS, type BlogFontKey } from "@portfolio/contracts/appearance";

/**
 * Which font file, if any, a route may preload.
 *
 * THEMING.md §4: "Preload only the critical variant for the active family and
 * locale. Non-default families load on selection." and "Optional blog families
 * MUST NOT be downloaded on non-blog routes."
 *
 * A `<link rel="preload">` is the one thing that can break that rule, because
 * it downloads a face whether or not any text uses it. So the hrefs live here,
 * in the web app, as a **static literal keyed by the registry key** — never
 * built from a stored value, per THEMING.md §8 — and only two call sites are
 * allowed to use them: the root layout preloads the site font, and the article
 * route preloads the resolved blog family. Nothing else preloads a font.
 *
 * The declarations these point at are in `app/globals.css`;
 * `test/font-delivery.spec.ts` fails if an href here is not a declared face.
 */

/**
 * The site font's critical variant.
 *
 * `globals.css` sets `font-family: JetBrains_Mono` on `*`, so this face renders
 * the chrome, the headings, and every Latin run on every route in both locales.
 * It is the only face that is critical everywhere.
 */
export const SITE_FONT_PRELOAD_HREF = "/Fonts/JetBrainsMono-Regular.woff2";

const BLOG_FONT_PRELOAD_HREF: {
  readonly [K in BlogFontKey]: string | null;
} = {
  // Already the site font: preloading it again on an article route would be a
  // second entry for a request the root layout has issued.
  "jetbrains-mono": null,
  "vazir-code": "/Fonts/Vazir-Code.woff2",
  // A system stack downloads nothing, which is the point of offering it.
  "system-sans": null,
};

/**
 * The face an article route should preload for the resolved blog family, or
 * `null` when preloading it would download something the page does not need.
 */
export function blogFontPreloadHref(fontKey: BlogFontKey): string | null {
  if (!BLOG_FONTS[fontKey].selfHosted) return null;
  return BLOG_FONT_PRELOAD_HREF[fontKey];
}

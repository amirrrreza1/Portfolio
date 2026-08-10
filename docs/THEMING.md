# Appearance and settings modal specification

Normative decision: [ADR-006](DECISIONS.md#adr-006--site-wide-theme-and-blog-only-typography-from-an-owner-defined-allowlist).

## 1. Scope

A settings modal lets a visitor change the site-wide theme, motion preference, and language, plus the font family and font size used only by the blog reading surface. The owner controls which options exist and which is the default. No appearance choice may cause a flash of the wrong theme, a layout shift, an accessibility regression, or a path from admin input to executable CSS.

Theme changes apply across the public site. Font family and font size changes apply only inside the blog content wrapper on `/[locale]/blog` routes. They MUST NOT change the portfolio, shared header, footer, navigation, settings UI, admin UI, or any other non-blog surface.

## 2. Control split

| Setting          | Owner defines                                    | Visitor chooses                                   |
| ---------------- | ------------------------------------------------ | ------------------------------------------------- |
| Theme            | enabled themes, order, site default              | active theme, or follow system; applies site-wide |
| Blog font family | enabled families, order, blog default per locale | active family for blog content only               |
| Blog font size   | allowed scale steps, default step                | active step for blog content only                 |
| Reduced motion   | whether the toggle is offered                    | on / off / follow system                          |
| Language         | enabled locales, default                         | active locale ([I18N.md](I18N.md))                |

The visitor's choice always wins over the corresponding configured default. The owner's allowlist always wins over the visitor's request: an option that is not enabled cannot be selected by crafting a cookie value.

## 3. Theme model

Themes are declared in code as complete sets of CSS custom properties on `:root`, selected by a single `data-theme` attribute on the root element.

```text
--color-bg, --color-surface, --color-border
--color-text, --color-text-muted
--color-primary, --color-secondary, --color-accent, --color-danger
--color-code-bg, --color-code-text
```

**Not yet adopted.** `globals.css` declares the legacy vocabulary instead — `--color-primary` and `--color-secondary` as a background/foreground pair, plus `--color-Gold`, `--color-main-red`, `--color-main-green`, and `--color-particle`. Every theme selects between those, so the mechanism is right and the names are not. Renaming is a mechanical change, but it touches every component, so it belongs with the M5 token work rather than being done piecemeal.

Required themes for this release: `dark` (current default), `light`, and `system` as a resolution mode rather than a token set. Additional themes are code additions.

Rules:

- Components consume tokens only. A hard-coded colour in a component is a defect; CI checks for raw hex values outside the token declarations and asset files. **The CI check does not exist yet**, so this rule is currently enforced by review alone.
- Every enabled theme MUST pass WCAG 2.2 AA contrast for body text, muted text, links, focus rings, borders that carry meaning, and both Shiki code themes. An enabled theme failing contrast is a release blocker, not a design preference.
- ~~The existing `ThemeContext` has two defects to correct: its `applyTheme` function contains an unreachable system-preference branch that the `"light" | "dark"` type makes impossible to hit, and it applies the theme inside `useEffect`, which guarantees a flash on first paint.~~ **Fixed in M5.** The provider now hydrates from the server-emitted attributes, and `system` is a real preference resolved by the pre-paint script in §5 rather than an unreachable branch.
- Shiki renders both a light and a dark highlighted variant at build/render time; theme switching selects between them with CSS. The client highlighter is never shipped.

## 4. Blog typography model

Blog fonts come from a **code-declared registry**. The admin panel enables, orders, and defaults; it never supplies a file path, family name, or CSS value. The selected family and size are scoped to a dedicated `.blog-reading-surface` wrapper. Shared site chrome and non-blog pages always use the fixed site typography defined by the design system.

Registry entry: internal key, display name, CSS family stack, supported scripts, available weights and styles, self-hosted `woff2` sources, and a metric-compatible fallback stack.

Initial registry:

| Key              | Family               | Scripts                | Notes                                                |
| ---------------- | -------------------- | ---------------------- | ---------------------------------------------------- |
| `jetbrains-mono` | JetBrains Mono       | Latin                  | Current site font; available for Latin blog content  |
| `vazir-code`     | Vazir Code           | Arabic/Persian + Latin | Required for `fa`; default for Persian blog content  |
| `system-sans`    | System UI sans stack | Both                   | Zero-download option, best for reading long articles |

Rules:

- Font files are self-hosted, `woff2` only. **Done in M0:** the `.eot`, `.ttf`, and `.woff` copies of the 16 JetBrains Mono faces and one Vazir Code face were removed (6.2 MB to 712 KB), and the `@font-face` declarations were rewritten with numeric weights — the previous ones gave ExtraBold and ExtraBoldItalic `font-weight: bold`, colliding with Bold and making weight 800 unreachable. All 17 faces are still declared unconditionally; reducing to the weights and styles the design actually uses is open, and belongs with the subsetting work below.
- Subset by script where licensing allows, and declare `unicode-range` so Latin text never downloads Persian glyphs.
- `font-display: swap` with a metric-compatible fallback, so a font swap does not reflow the article.
- Preload only the critical variant for the active family and locale. Non-default families load on selection.
- No dynamic `@font-face` generation from any stored value. Font CSS is static, authored, and reviewed. Upload of font files is out of scope for this release.
- A family that does not support the current locale's script cannot be selected in that locale; the switcher only offers script-compatible options.
- Optional blog families MUST NOT be downloaded on non-blog routes. A font selection changes only descendants of `.blog-reading-surface`; no selector may apply the visitor's blog font or size to `html`, `body`, or shared layout components.

## 5. Persistence and no-flash server rendering

The mechanism that makes this work without a flash:

1. A first-party cookie `portfolio_prefs` holds a small, versioned, strictly validated JSON object: `{v, theme, blogFont, blogSize, motion}`. It is `Secure` in production, `SameSite=Lax`, `Path=/`, host-only, and **not** `HttpOnly`, because the client also reads it. It contains no personal data, no identifier, and no security value.
2. The dynamic server-rendered HTML shell reads the cookie and validates each field against the enabled allowlist. It emits `data-theme` on `<html>`. On blog routes only, it also emits `data-blog-font` and `data-blog-size` on `.blog-reading-surface`; those attributes MUST NOT appear on the root element or non-blog pages.
3. There is therefore no client-side correction on first paint and no flash. The provider hydrates from the same attributes rather than re-deriving them, so server and client markup agree.
4. `theme: system` is the one case needing client resolution. It is handled with a tiny inline script, allowed by a CSP nonce, that reads `prefers-color-scheme` and sets the attribute before first paint — plus a `@media (prefers-color-scheme)` fallback so the page is still correct with JavaScript disabled. This script is the only inline script permitted on public pages, it is reviewed, and it contains no interpolated values.
5. Changing a setting updates its scoped attribute immediately, then writes the cookie. Theme updates `<html>`; blog typography updates `.blog-reading-surface` when present. Nothing re-fetches and nothing re-renders the page.
6. `localStorage` is not used for appearance, because the server cannot read it. The existing `localStorage.getItem("theme")` behaviour is migrated once: an existing value is adopted into the cookie on first visit, then the key is removed. **Outstanding.** The M5 rewrite removed the `localStorage` read without adding the adoption step, so a returning visitor's stored theme is silently dropped and they see the site default once before re-choosing.

**Caching:** appearance MUST NOT enter a shared data-cache key. Per [ADR-009](DECISIONS.md#adr-009--dynamic-html-shell-with-shared-cached-public-data-for-visitor-appearance), public HTML shells are dynamic and are not stored in a shared full-page cache. Public DTOs, rendered article bodies, and media metadata remain shared and tagged; two visitors with different preferences reuse those same cache entries. `Vary: Cookie` on public pages is prohibited. The shell may vary only the allowlisted appearance attributes, never content or authorization state.

The `system` theme still uses the reviewed nonced pre-paint script because the server does not know the visitor's media-query result. Explicit theme choices do not depend on client correction.

## 6. Settings modal UX

- Reachable from the header control that currently holds the theme toggle, and from the footer. The keyboard shortcut is documented in the modal.
- A real accessible dialog: focus trapped, focus restored to the trigger on close, `Escape` closes, `aria-modal` with a labelled heading, no scroll lock that breaks keyboard scrolling.
- Every option is a labelled control with a visible current state. Theme options are identified by name, not by colour swatch alone. Font controls are labelled "Blog font" and "Blog text size" and explain that they do not affect the rest of the site.
- Changes apply live with no Save button, and a single Reset returns everything to the configured site and blog defaults.
- The modal is server-rendered as markup and progressively enhanced. With JavaScript disabled the site still renders at the cookie's or site's default appearance; the controls simply do not operate.
- Loading the modal must not pull the heavy interactive code (Rubik cube, particles) into the initial bundle; it is a separately loaded chunk.
- Reduced motion, when on or when the system requests it, disables the scramble text, typing animation, particle background, smooth scroll, and cube auto-rotation. `prefers-reduced-motion` is respected by default without requiring a visit to the modal.

## 7. Admin configuration

`AppearanceSettings` is a singleton record per [DATA_MODEL.md](DATA_MODEL.md) §4: enabled theme keys with order, default theme, enabled blog-font keys with order, default blog font per locale, allowed blog-size steps, default blog-size step, and whether the motion toggle is offered. It carries a `version` for optimistic concurrency and is revisioned and audited like any other content change.

Validation on write: every key MUST exist in the code registry; the default MUST be among the enabled set; at least one theme and one script-compatible blog font per enabled locale MUST remain enabled. Disabling a theme or blog font a visitor currently has selected resolves that preference to its new default on the visitor's next request.

## 8. Security notes

- No stored appearance value is ever interpolated into a `style` attribute, a `<style>` block, a CSS custom property value, or a font URL. Stored values are keys; keys map to static CSS. This is what keeps an appearance feature from becoming a CSS injection vector.
- The preferences cookie is untrusted input. It is size-bounded, schema-validated, and allowlist-checked on every request. An oversized, malformed, or unknown value is discarded, not repaired.
- The cookie carries no authentication meaning and MUST NOT be used for anything other than appearance.
- CSP allows exactly one nonced inline script for system-theme resolution and no `unsafe-inline` styles; remaining inline styles in components are to be removed rather than allowed.
- Font and CSS assets are served from the same origin with immutable fingerprinted caching.

## 9. Tests

- No flash: the initial HTML for a cookie set to light contains `data-theme="light"`; no theme correction occurs after hydration; no hydration mismatch warning.
- `system` mode resolves before first paint and follows a live `prefers-color-scheme` change.
- Cookie tampering: unknown theme, disabled theme, oversized cookie, malformed JSON, wrong version — each falls back to the default without an error page.
- Allowlist enforcement: a disabled option cannot be activated through the API or the cookie.
- Contrast: automated AA checks for every enabled theme across body text, muted text, links, focus rings, meaningful borders, and both code themes.
- Caching: public responses do not send `Vary: Cookie`; two visitors with different preferences reuse one public-data cache entry while receiving the correct dynamic shell attributes; appearance is absent from shared cache keys.
- Reduced motion: system preference alone disables every animation listed in §6.
- Dialog accessibility: focus trap and restore, `Escape`, labelling, keyboard-only operation.
- Blog typography: only `woff2` is requested; optional blog families are not downloaded on non-blog routes; the selected family and size affect only `.blog-reading-surface`; shared chrome and non-blog pages retain fixed site typography; `unicode-range` prevents cross-script downloads; a script-incompatible family is not offered.
- No-JavaScript: the page renders at the correct default appearance and remains readable.
- Migration: an existing `localStorage` theme is adopted into the cookie once and the key is removed.

# Appearance behavior specification

Normative decision: [ADR-006](DECISIONS.md#adr-006--site-wide-theme-and-blog-only-typography-from-an-owner-defined-allowlist).

## 1. Scope

A compact theme toggle is the only public appearance control. The former settings modal has been retired: blog font, blog text size, and motion behavior are code-owned design choices, and blog language is selected in the blog itself. No appearance behavior may cause a flash of the wrong theme, a layout shift, an accessibility regression, or a path from stored data to executable CSS.

Theme changes apply across the public site. Font family and font size changes apply only inside the blog content wrapper on `/[locale]/blog` routes. They MUST NOT change the portfolio, shared header, footer, navigation, settings UI, admin UI, or any other non-blog surface.

## 2. Control split

| Setting          | Code defines                           | Visitor chooses        |
| ---------------- | -------------------------------------- | ---------------------- |
| Theme            | reviewed themes and default            | active site-wide theme |
| Blog font family | one script-compatible default/locale   | not exposed            |
| Blog font size   | one reviewed reading size              | not exposed            |
| Reduced motion   | follow the operating-system preference | not exposed            |

The visitor's choice always wins over the corresponding configured default. The owner's allowlist always wins over the visitor's request: an option that is not enabled cannot be selected by crafting a cookie value.

## 3. Theme model

Themes are declared in code as complete sets of CSS custom properties on `:root`, selected by a single `data-theme` attribute on the root element.

```text
--color-bg, --color-surface, --color-border
--color-text, --color-text-muted
--color-primary, --color-secondary, --color-accent, --color-danger
--color-code-bg, --color-code-text
```

**Adopted 2026-08-16.** `globals.css` declares exactly this set, per theme, and three documented extensions: `--color-success`, the counterpart of `--color-danger` that project status needs; `--color-particle`, decorative canvas output read through `getPropertyValue` and therefore carrying no contrast requirement; and `--color-scrim`, the modal backdrop, which is the one colour that deliberately does **not** flip with the theme, because a white scrim on the light theme dims nothing.

Values are per theme rather than shared. The retired vocabulary carried one value for `--color-Gold`, `--color-main-red`, and `--color-main-green` across both themes, and five of those pairings failed AA — a colour required to clear 4.5:1 against both `#000000` and `#ffffff` is squeezed toward mid-grey. `@portfolio/contracts/appearance` holds the values, and `apps/web/test/theme-tokens.spec.ts` asserts the stylesheet matches them, including the two `prefers-color-scheme` fallback copies. See [`status/evidence/M5-theme-tokens.md`](status/evidence/M5-theme-tokens.md).

Required themes for this release: `dark` (current default), `light`, and `system` as a resolution mode rather than a token set. Additional themes are code additions.

Rules:

- Components consume tokens only. A hard-coded colour in a component is a defect; CI checks for raw hex values outside the token declarations and asset files. **Enforced since 2026-08-16** by `apps/web/test/theme-tokens.spec.ts`, which runs under `pnpm test`. It rejects raw hex/`rgb()`/`hsl()`/`oklch()` values, every Tailwind palette utility, and the retired token names, against a three-entry allowlist that must each still contain a raw colour so stale exemptions cannot accumulate.
- No colour may be thinned with an opacity modifier where its contrast matters. `text-secondary/70` renders a colour that depends on whatever is behind it, so no contrast tool can check it; the migration replaced every such use with a real `--color-text-muted` or `--color-border` token.
- `dark:` MUST NOT be used to switch a colour. No `@custom-variant dark` is declared, so Tailwind resolves it against `prefers-color-scheme` rather than against the selected `data-theme`. Three utilities depended on it before the migration, and the tooltip among them rendered white on white for a visitor using the dark site theme on a light operating system. Tokens already flip with the theme; the variant is redundant as well as wrong.
- Every enabled theme MUST pass WCAG 2.2 AA contrast for body text, muted text, links, focus rings, borders that carry meaning, and both Shiki code themes. An enabled theme failing contrast is a release blocker, not a design preference. `checkThemeContrast` in `@portfolio/contracts/appearance` measures the thirteen pairings; text is held to SC 1.4.3 (4.5:1) and borders and the focus ring to SC 1.4.11 (3:1), which is the correct bound for a non-text boundary. **Completed in M9:** Markdown rendering converts Shiki's finite dual-theme palette to reviewed static classes, and the stylesheet selects the light or dark tokens from the resolved `data-theme`, including no-script system fallbacks. Palette drift fails closed in the renderer and tests.
- Stored colours are checked against the themes rather than against one surface. `checkBadgeColorContrast` in `@portfolio/contracts/appearance` holds the theme page backgrounds and the derived-label rule, so the migration, the admin write path, and any future colour field all measure the same thing. It defaults to the whole theme registry, not to the currently enabled set, because re-enabling a theme must not turn already-stored data inaccessible.
- ~~The existing `ThemeContext` has two defects to correct: its `applyTheme` function contains an unreachable system-preference branch that the `"light" | "dark"` type makes impossible to hit, and it applies the theme inside `useEffect`, which guarantees a flash on first paint.~~ **Fixed in M5.** The provider now hydrates from the server-emitted attributes, and `system` is a real preference resolved by the pre-paint script in §5 rather than an unreachable branch.
- Shiki renders both a light and a dark highlighted variant at build/render time; theme switching selects between them with CSS. The client highlighter is never shipped.

## 4. Blog typography model

Blog fonts come from a **code-declared registry**. The chosen family and size are scoped to a dedicated `.blog-reading-surface` wrapper. Shared site chrome and non-blog pages always use the fixed site typography defined by the design system. Neither the public blog nor the admin panel exposes typography controls.

Registry entry: internal key, display name, CSS family stack, supported scripts, available weights and styles, self-hosted `woff2` sources, and a metric-compatible fallback stack.

Initial registry:

| Key              | Family               | Scripts        | Notes                                                |
| ---------------- | -------------------- | -------------- | ---------------------------------------------------- |
| `jetbrains-mono` | JetBrains Mono       | Latin          | Current site font; available for Latin blog content  |
| `vazir-code`     | Shabnam              | Arabic/Persian | Required for `fa`; default for Persian blog content  |
| `system-sans`    | System UI sans stack | Both           | Zero-download option, best for reading long articles |

Rules:

- Font files are self-hosted, `woff2` only. JetBrains Mono ships only the six faces the design selects: 400, 400 italic, 500, 600, 700, and 700 italic. Shabnam ships only its without-Latin 400, 500, and 700 faces; obsolete `.eot`, `.ttf`, and `.woff` copies and unused thin/light variants are not kept.
- Subset by script where licensing allows, and declare `unicode-range` so Latin text never downloads Persian glyphs. Every declared face carries a `unicode-range`; JetBrains Mono declares no Arabic block; and Shabnam uses the upstream without-Latin builds so Latin runs fall through to JetBrains Mono.
- `font-display: swap` with a metric-compatible fallback, so a font swap does not reflow the article.
- Preload only the critical variant for the active family and locale. Non-default families load on selection. **Done in M5:** the root layout preloads the site font's regular face and nothing else; the article route is the only place that may preload a blog family, and it does so only when that family is self-hosted and is not already the site font. The hrefs are a static literal keyed by the registry key in `apps/web/src/server/font-delivery.ts`, and `test/font-delivery.spec.ts` fails if any other source file names a font file.
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
6. `localStorage` is not used for appearance, because the server cannot read it. The existing `localStorage.getItem("theme")` behaviour is migrated once: a valid existing value is adopted into the cookie on first visit, then the key is removed. A valid M5 cookie always wins, and malformed legacy values are discarded. **Delivered 2026-08-24.**

**Caching:** appearance MUST NOT enter a shared data-cache key. Per [ADR-009](DECISIONS.md#adr-009--dynamic-html-shell-with-shared-cached-public-data-for-visitor-appearance), public HTML shells are dynamic and are not stored in a shared full-page cache. Public DTOs, rendered article bodies, and media metadata remain shared and tagged; two visitors with different preferences reuse those same cache entries. `Vary: Cookie` on public pages is prohibited. The shell may vary only the allowlisted appearance attributes, never content or authorization state.

The `system` theme still uses the reviewed nonced pre-paint script because the server does not know the visitor's media-query result. Explicit theme choices do not depend on client correction.

## 6. Public appearance control

- The header theme button is labelled and keyboard-operable.
- No appearance dialog, blog-font selector, blog-size selector, or motion selector is rendered on portfolio or blog pages.
- `prefers-reduced-motion` disables the scramble text, typing animation, particle background, smooth scroll, and cube auto-rotation without requiring a site control.

## 7. Code-owned configuration

The admin panel does not expose appearance settings. The registry and reviewed defaults remain code-owned; the existing `AppearanceSettings` persistence contract is retained only for compatibility with previously issued preference cookies and the current public API boundary.

Validation on write: every key MUST exist in the code registry; the default MUST be among the enabled set; at least one theme and one script-compatible blog font per enabled locale MUST remain enabled. Disabling a theme or blog font a visitor currently has selected resolves that preference to its new default on the visitor's next request.

## 8. Security notes

- No stored appearance value is ever interpolated into a `style` attribute, a `<style>` block, a CSS custom property value, or a font URL. Stored values are keys; keys map to static CSS. This is what keeps an appearance feature from becoming a CSS injection vector.
- The preferences cookie is untrusted input. It is size-bounded, schema-validated, and allowlist-checked on every request. An oversized, malformed, or unknown value is discarded, not repaired.
- The cookie carries no authentication meaning and MUST NOT be used for anything other than appearance.
- CSP allows exactly one nonced inline script for system-theme resolution and no `unsafe-inline` styles. Application components carry no inline styles, and M9 converts Shiki's finite dual-theme palette to allowlisted static classes before rendered HTML is persisted. Palette drift fails closed until the matching stylesheet classes are reviewed.
- Font and CSS assets are served from the same origin with immutable fingerprinted caching.

## 9. Tests

The static and unit half runs under `pnpm test`; the half that needs a rendered page runs under `pnpm --filter @portfolio/web test:e2e` (Playwright, against a production build). The most recent full run is recorded in [`docs/status/evidence/M5-appearance-matrix.md`](status/evidence/M5-appearance-matrix.md).

- No flash: the initial HTML for a cookie set to light contains `data-theme="light"`; no theme correction occurs after hydration; no hydration mismatch warning.
- `system` mode resolves before first paint and follows a live `prefers-color-scheme` change.
- Cookie tampering: unknown theme, disabled theme, oversized cookie, malformed JSON, wrong version — each falls back to the default without an error page.
- Allowlist enforcement: a disabled option cannot be activated through the API or the cookie.
- Contrast: automated AA checks for every enabled theme across body text, muted text, links, focus rings, meaningful borders, and both code themes.
- Caching: public responses do not send `Vary: Cookie`; two visitors with different preferences reuse one public-data cache entry while receiving the correct dynamic shell attributes; appearance is absent from shared cache keys.
- Reduced motion: system preference alone disables every animation listed in §6.
- Appearance UI retirement: blog pages contain no appearance dialog or dialog trigger.
- Blog typography: only `woff2` is requested; optional blog families are not downloaded on non-blog routes; the selected family and size affect only `.blog-reading-surface`; shared chrome and non-blog pages retain fixed site typography; `unicode-range` prevents cross-script downloads; a script-incompatible family is not offered.
- No-JavaScript: the page renders at the correct default appearance and remains readable.
- Migration: an existing valid `localStorage` theme is adopted into the cookie once and the key is removed; malformed values and a pre-existing valid cookie never override the resolved appearance.

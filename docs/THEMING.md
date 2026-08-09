# Appearance and settings modal specification

Normative decision: [ADR-006](DECISIONS.md#adr-006--visitor-selectable-theme-and-font-from-an-owner-defined-allowlist).

## 1. Scope

A settings modal lets a visitor change theme, font family, font size, motion, and language. The owner controls which options exist and which is the default. No appearance choice may cause a flash of the wrong theme, a layout shift, an accessibility regression, or a path from admin input to executable CSS.

## 2. Control split

| Setting | Owner defines | Visitor chooses |
| --- | --- | --- |
| Theme | enabled themes, order, site default | active theme, or follow system |
| Font family | enabled families, order, site default per locale | active family |
| Font size | allowed scale steps, default step | active step |
| Reduced motion | whether the toggle is offered | on / off / follow system |
| Language | enabled locales, default | active locale ([I18N.md](I18N.md)) |

The visitor's choice always wins over the site default. The owner's allowlist always wins over the visitor's request: an option that is not enabled cannot be selected by crafting a cookie value.

## 3. Theme model

Themes are declared in code as complete sets of CSS custom properties on `:root`, selected by a single `data-theme` attribute on the root element.

```text
--color-bg, --color-surface, --color-border
--color-text, --color-text-muted
--color-primary, --color-secondary, --color-accent, --color-danger
--color-code-bg, --color-code-text
```

Required themes for this release: `dark` (current default), `light`, and `system` as a resolution mode rather than a token set. Additional themes are code additions.

Rules:

- Components consume tokens only. A hard-coded colour in a component is a defect; CI checks for raw hex values outside the token declarations and asset files.
- Every enabled theme MUST pass WCAG 2.2 AA contrast for body text, muted text, links, focus rings, borders that carry meaning, and both Shiki code themes. An enabled theme failing contrast is a release blocker, not a design preference.
- The existing `ThemeContext` has two defects to correct: its `applyTheme` function contains an unreachable system-preference branch that the `"light" | "dark"` type makes impossible to hit, and it applies the theme inside `useEffect`, which guarantees a flash on first paint. Both are resolved by §5.
- Shiki renders both a light and a dark highlighted variant at build/render time; theme switching selects between them with CSS. The client highlighter is never shipped.

## 4. Font model

Fonts come from a **code-declared registry**. The admin panel enables, orders, and defaults; it never supplies a file path, family name, or CSS value.

Registry entry: internal key, display name, CSS family stack, supported scripts, available weights and styles, self-hosted `woff2` sources, and a metric-compatible fallback stack.

Initial registry:

| Key | Family | Scripts | Notes |
| --- | --- | --- | --- |
| `jetbrains-mono` | JetBrains Mono | Latin | Current site font; monospace identity |
| `vazir-code` | Vazir Code | Arabic/Persian + Latin | Required for `fa`; default for Persian pages |
| `system-sans` | System UI sans stack | Both | Zero-download option, best for reading long articles |

Rules:

- Font files are self-hosted, `woff2` only. The current `.eot`, `.ttf`, and `.woff` copies of 17 JetBrains Mono faces are dead weight in the repository and MUST be removed: `.eot` exists only for Internet Explorer, and `woff2` covers every supported browser. Keep only the weights and styles the design actually uses.
- Subset by script where licensing allows, and declare `unicode-range` so Latin text never downloads Persian glyphs.
- `font-display: swap` with a metric-compatible fallback, so a font swap does not reflow the article.
- Preload only the critical variant for the active family and locale. Non-default families load on selection.
- No dynamic `@font-face` generation from any stored value. Font CSS is static, authored, and reviewed. Upload of font files is out of scope for this release.
- A family that does not support the current locale's script cannot be selected in that locale; the switcher only offers script-compatible options.

## 5. Persistence and no-flash server rendering

The mechanism that makes this work without a flash:

1. A first-party cookie `portfolio_prefs` holds a small, versioned, strictly validated JSON object: `{v, theme, font, size, motion}`. It is `Secure` in production, `SameSite=Lax`, `Path=/`, host-only, and **not** `HttpOnly`, because the client also reads it. It contains no personal data, no identifier, and no security value.
2. The server reads the cookie during rendering, validates each field against the enabled allowlist, falls back to the site default on any invalid or unknown value, and emits `data-theme`, `data-font`, and `data-size` on the `<html>` element in the initial HTML.
3. There is therefore no client-side correction on first paint and no flash. The provider hydrates from the same attributes rather than re-deriving them, so server and client markup agree.
4. `theme: system` is the one case needing client resolution. It is handled with a tiny inline script, allowed by a CSP nonce, that reads `prefers-color-scheme` and sets the attribute before first paint — plus a `@media (prefers-color-scheme)` fallback so the page is still correct with JavaScript disabled. This script is the only inline script permitted on public pages, it is reviewed, and it contains no interpolated values.
5. Changing a setting updates the attribute immediately, then writes the cookie. Nothing re-fetches and nothing re-renders the page.
6. `localStorage` is not used for appearance, because the server cannot read it. The existing `localStorage.getItem("theme")` behaviour is migrated once: an existing value is adopted into the cookie on first visit, then the key is removed.

**Caching:** appearance MUST NOT enter the cache key. Because theme and font are expressed entirely as root attributes plus CSS custom properties, one cached HTML document serves every combination. `Vary: Cookie` on public pages is prohibited — it would fragment the cache per visitor and destroy the ISR benefit described in [ARCHITECTURE.md](ARCHITECTURE.md) §6. The only per-visitor variation permitted in cached HTML is the root element's attribute values, which are set by the edge/render layer from the cookie without varying the cached body.

Consequence to accept: a full-page CDN cache that cannot rewrite the root attribute will serve the site default and the inline script corrects it before paint. This is a one-attribute correction, not a repaint of the page.

## 6. Settings modal UX

- Reachable from the header control that currently holds the theme toggle, and from the footer. The keyboard shortcut is documented in the modal.
- A real accessible dialog: focus trapped, focus restored to the trigger on close, `Escape` closes, `aria-modal` with a labelled heading, no scroll lock that breaks keyboard scrolling.
- Every option is a labelled control with a visible current state. Theme options are identified by name, not by colour swatch alone.
- Changes apply live with no Save button, and a single Reset returns everything to site defaults.
- The modal is server-rendered as markup and progressively enhanced. With JavaScript disabled the site still renders at the cookie's or site's default appearance; the controls simply do not operate.
- Loading the modal must not pull the heavy interactive code (Rubik cube, particles) into the initial bundle; it is a separately loaded chunk.
- Reduced motion, when on or when the system requests it, disables the scramble text, typing animation, particle background, smooth scroll, and cube auto-rotation. `prefers-reduced-motion` is respected by default without requiring a visit to the modal.

## 7. Admin configuration

`AppearanceSettings` is a singleton record per [DATA_MODEL.md](DATA_MODEL.md) §4: enabled theme keys with order, default theme, enabled font keys with order, default font per locale, allowed size steps, default size step, and whether the motion toggle is offered. It carries a `version` for optimistic concurrency and is revisioned and audited like any other content change.

Validation on write: every key MUST exist in the code registry; the default MUST be among the enabled set; at least one theme and one script-compatible font per enabled locale MUST remain enabled. Disabling the theme a visitor currently has selected resolves that visitor to the new default on their next request.

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
- Caching: public responses do not send `Vary: Cookie`; two visitors with different preferences share a cache entry; appearance is absent from cache keys.
- Reduced motion: system preference alone disables every animation listed in §6.
- Dialog accessibility: focus trap and restore, `Escape`, labelling, keyboard-only operation.
- Fonts: only `woff2` requested; the non-default family is not downloaded until selected; `unicode-range` prevents cross-script downloads; a script-incompatible family is not offered.
- No-JavaScript: the page renders at the correct default appearance and remains readable.
- Migration: an existing `localStorage` theme is adopted into the cookie once and the key is removed.

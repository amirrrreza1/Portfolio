# M5 — appearance and accessibility matrix run

Run: **2026-08-24**  
Milestone: [M5](../M5.md) · Specification: [THEMING.md §9](../../THEMING.md#9-tests)

The browser half of the THEMING.md §9 test list, run against a production build.

## What was run

```
apps/web $ pnpm exec next build          # production build, not `next dev`
apps/web $ pnpm exec next start --port 3210
apps/web $ pnpm test:e2e                 # playwright test
```

- Playwright 1.62.1, Chromium, one worker (appearance is per-visitor state).
- `PORTFOLIO_DATA_SOURCE=database`, so the routes under test are the real
  database-backed read paths. The legacy source has no articles at all and
  cannot exercise §4 or §9.
- The public API is replaced by `apps/web/e2e/fixtures/public-api-server.mts`.
  Every response is built by parsing through the same contract schema the real
  API projects and the web client validates, and the article body is rendered by
  the real `@portfolio/markdown` pipeline — so the Shiki markup the browser
  receives is the markup a published article receives.
- Production CSP, deliberately: `next dev` adds `'unsafe-eval'` to `script-src`,
  and a security-header assertion against the development policy would prove the
  wrong thing.

## Result

```
Running 35 tests using 1 worker
...
  35 passed (50.4s)
```

| §9 requirement                                                                                                                  | Covered by                                                                                                                             | Result            |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| No flash; initial HTML carries the cookie's theme; no correction after hydration; no hydration mismatch                         | `no flash: the first byte already carries the preference` (3 tests)                                                                    | pass              |
| `system` resolves before first paint and follows a live `prefers-color-scheme` change                                           | `system mode resolves before first paint and follows the OS` (2 tests)                                                                 | pass              |
| Cookie tampering — unknown theme, disabled theme, oversized, malformed JSON, wrong version                                      | `cookie tampering falls back without an error page` (7 tests)                                                                          | pass              |
| Allowlist enforcement: a disabled option cannot be activated through the cookie                                                 | `allowlist enforcement` (2 tests)                                                                                                      | pass              |
| Contrast: automated AA for every theme and state                                                                                | [`M5-theme-tokens.md`](M5-theme-tokens.md), 26 pairings                                                                                | pass (2026-08-16) |
| Caching: no `Vary: Cookie`; two visitors reuse one public-data entry                                                            | `caching: appearance never enters a shared key` (2 tests)                                                                              | pass              |
| Reduced motion: the system preference alone disables animation                                                                  | `reduced motion` (3 tests, incl. a control)                                                                                            | pass              |
| Dialog accessibility: focus trap and restore, `Escape`, labelling, keyboard-only                                                | `settings dialog accessibility` (2 tests)                                                                                              | pass              |
| Blog typography: woff2 only; optional families absent from non-blog routes; scoped to `.blog-reading-surface`; chrome unchanged | `blog typography stays inside the reading surface` (4 tests) + [`font-delivery.spec.ts`](../../../apps/web/test/font-delivery.spec.ts) | pass              |
| No-JavaScript: correct default appearance, still readable                                                                       | `is still correct with JavaScript disabled`                                                                                            | pass              |
| Migration: legacy `localStorage` theme adopted once, key removed, cookie wins                                                   | `legacy localStorage migration — THEMING.md §5.6` (3 tests)                                                                            | pass              |
| Public, error, and no-JavaScript responses pass CSP and security-header checks                                                  | `security headers — THEMING.md §8` (3 tests)                                                                                           | pass              |
| Code blocks follow the selected theme                                                                                           | `code blocks follow the selected theme` (3 tests)                                                                                      | pass              |

## Observed values

Public page headers, `GET /en`:

```
content-security-policy: default-src 'self'; base-uri 'self'; object-src 'none';
  frame-ancestors 'none'; script-src 'self' 'nonce-RiOX4bWwxnoz64VJZewZ+g==';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:;
  font-src 'self'; connect-src 'self'; form-action 'self'
Vary: rsc, next-router-state-tree, next-router-prefetch,
  next-router-segment-prefetch, Accept-Encoding
```

No `Cookie` in `Vary`, on either a portfolio route or an article route. The
localized outage response returns `503` with `content-language: fa`,
`retry-after: 60`, `noindex,nofollow`, `dir="rtl"`, and the same header set.

Shiki now emits no `color` at all, only the two custom properties that
`globals.css` selects between:

```html
<pre
  style="--shiki-light:#24292e;--shiki-dark:#e1e4e8;
            --shiki-light-bg:#fff;--shiki-dark-bg:#24292e"
  class="code-block language-known"
></pre>
```

Measured on the `const` keyword: `rgb(249, 117, 131)` on the dark theme,
`rgb(215, 58, 73)` on the light theme, and `rgb(215, 58, 73)` for a light-theme
visitor whose operating system is dark — the case a `dark:` variant or a bare
media query would have got wrong.

Fonts shipped after the M5 reduction — 7 files, 283 KB, down from 17 files and
712 KB:

```
JetBrainsMono-Regular.woff2     38464
JetBrainsMono-Italic.woff2      40776
JetBrainsMono-Medium.woff2      39592
JetBrainsMono-SemiBold.woff2    39620
JetBrainsMono-Bold.woff2        39728
JetBrainsMono-BoldItalic.woff2  42072
Vazir-Code.woff2                49648
```

## Defects this run found

1. **Every Persian article route answered 404.** Next.js hands a dynamic segment
   through percent-encoded when it contains non-ASCII characters, so
   `slugSchemaFor("fa")` was validating `%D9%85%D8%A7...` rather than
   `ماتریس-تم` and the route called `notFound()` — including for the links the
   blog index itself generates. ASCII slugs never showed it, because Next
   normalizes the safe escapes in an ASCII path before the route sees it. Fixed
   by `decodeSlugParam` in `src/i18n/routing.ts`, used by both the page and its
   `generateMetadata`; the middleware's route gate and the article `not-found`
   boundary already decoded. Regression coverage is in
   `test/routing.spec.ts`, which round-trips the link `articlePath` produces.
2. **`pnpm lint` failed on `dev`.** The 2026-08-24 `localStorage` migration calls
   `setState` synchronously inside an effect, which `react-hooks/set-state-in-effect`
   rejects. The shape is correct for this case — the server cannot read
   `localStorage`, so it cannot seed `useState` and reading it during render
   would break hydration — so the rule is disabled on that line with the reason
   recorded next to it.

## Not covered here

- Manual screen-reader verification. The dialog's roles, labelling, focus trap,
  and keyboard operation are asserted, and a native modal `<dialog>` supplies
  the trap, but no assistive technology has read the page.
- Nobody has looked at the light theme. The contrast fixes, the Skills card
  change, and now the light code surface are all measured, not seen.
- One browser. Chromium only; the `unicode-range` and `@font-face` behaviour in
  Firefox and Safari is assumed, not observed.

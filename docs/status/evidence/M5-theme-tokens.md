# M5 — Theme tokens and the AA contrast matrix

Run date: **2026-08-16**
Scope: [THEMING.md §3](../../THEMING.md#3-theme-model) token vocabulary, the
component migration off raw colours, and the automated enforcement that keeps
both true. This is a **static** proof — it measures declared token values and
scans source. It is not a browser run, and it does not close §9's
hydration, cookie-tampering, `system`, no-JavaScript, shared-cache, or
font-download rows.

## What the migration found

The previous vocabulary was `--color-primary`/`--color-secondary` used as a
background/foreground pair plus `--color-Gold`, `--color-main-red`,
`--color-main-green`, and `--color-particle`, with a single value for each
across **both** themes. Auditing those values against the two page backgrounds
turned up five WCAG 2.2 AA failures that review had not caught, because a
colour is only ever looked at in one theme at a time:

| Value                            | Where                                               | Measured        | Required |
| -------------------------------- | --------------------------------------------------- | --------------- | -------- |
| `text-gray-400` (`#99a1af`)      | project descriptions and dates, gallery search icon | 2.60:1 on light | 4.5:1    |
| `--color-Gold` (`#d0c39d`)       | project featured marker                             | 1.75:1 on light | 4.5:1    |
| `--color-main-green` (`#22c55d`) | completed project status                            | 2.28:1 on light | 4.5:1    |
| `--color-main-red` (`#e11d48`)   | validation errors, in-progress project status       | 4.47:1 on dark  | 4.5:1    |
| `text-gray-500` (`#6a7282`)      | gallery search placeholder                          | 4.34:1 on dark  | 4.5:1    |

Four further defects were found in the same pass and are not contrast
arithmetic:

1. **`dark:` was wired to the wrong signal.** No `@custom-variant dark` is
   declared, so Tailwind's `dark:` resolves against `prefers-color-scheme`, not
   against the `data-theme` attribute the site actually selects with. Three
   utilities depended on it. The worst was the tooltip
   (`bg-secondary dark:text-primary … text-white`): a visitor on a light
   operating system using the dark site theme got white text on a white
   tooltip. The footer's social links had the same shape
   (`dark:hover:bg-secondary … hover:text-black`) and went invisible on hover.
2. **`hover:bg-white/20`** on the header navigation is invisible on the light
   theme.
3. **The Skills category card** painted `bg-secondary/60` — 60% of the
   foreground over the page — and then placed foreground-coloured chips on it:
   **2.2:1** on dark and **3.3:1** on light. Both fail.
4. **Opacity-thinned text** (`text-secondary/70`, `/75`) cannot be checked by
   any contrast tool, because the rendered colour depends on what is behind it.
   These were the majority of muted text on the site.

## What changed

- `globals.css` declares the §3 vocabulary — `--color-bg`, `--color-surface`,
  `--color-border`, `--color-text`, `--color-text-muted`, `--color-primary`,
  `--color-secondary`, `--color-accent`, `--color-danger`, `--color-code-bg`,
  `--color-code-text` — plus three documented extensions: `--color-success`
  (the counterpart of `danger` that project status needs), `--color-particle`
  (decorative canvas output, no contrast requirement), and `--color-scrim` (the
  modal backdrop, deliberately theme-independent).
- Values are **per theme**. A colour required to clear 4.5:1 against both
  `#000000` and `#ffffff` is squeezed toward mid-grey; per-theme values are what
  make AA reachable without flattening the palette.
- 106 colour utilities across 22 files were rewritten, and the opacity-thinned
  text and border variants were replaced with real `text-muted` and `border`
  tokens so they are measurable.
- The two `prefers-color-scheme` fallbacks are now scoped
  `:root[data-theme="system"]:not([data-system-theme])`, so the media fallback
  and the script-resolved attribute can never both apply. Previously they
  differed only in source order.

## Contrast matrix

Produced by `checkThemeContrast` in
[`packages/contracts/src/appearance/tokens.ts`](../../../packages/contracts/src/appearance/tokens.ts).
Text pairings are held to WCAG 2.2 SC 1.4.3 (4.5:1); borders and the focus ring
to SC 1.4.11 (3:1), which is the correct bound for a non-text boundary.

```text
PASS  dark  body-text              #ffffff on #000000 = 21.00:1 (min 4.5:1)
PASS  dark  body-text-on-surface   #ffffff on #1a1a1a = 17.40:1 (min 4.5:1)
PASS  dark  muted-text             #a3a3a3 on #000000 =  8.33:1 (min 4.5:1)
PASS  dark  muted-text-on-surface  #a3a3a3 on #1a1a1a =  6.90:1 (min 4.5:1)
PASS  dark  link                   #ffffff on #000000 = 21.00:1 (min 4.5:1)
PASS  dark  primary-fill-label     #000000 on #ffffff = 21.00:1 (min 4.5:1)
PASS  dark  secondary-fill-label   #ffffff on #333333 = 12.63:1 (min 4.5:1)
PASS  dark  accent-text            #d0c39d on #000000 = 11.97:1 (min 4.5:1)
PASS  dark  danger-text            #f43f5e on #000000 =  5.72:1 (min 4.5:1)
PASS  dark  success-text           #22c55d on #000000 =  9.21:1 (min 4.5:1)
PASS  dark  code                   #c9d1d9 on #0d1117 = 12.26:1 (min 4.5:1)
PASS  dark  border                 #666666 on #000000 =  3.66:1 (min 3.0:1)
PASS  dark  focus-ring             #ffffff on #000000 = 21.00:1 (min 3.0:1)
PASS  light body-text              #000000 on #ffffff = 21.00:1 (min 4.5:1)
PASS  light body-text-on-surface   #000000 on #f2f2f2 = 18.76:1 (min 4.5:1)
PASS  light muted-text             #5c5c5c on #ffffff =  6.69:1 (min 4.5:1)
PASS  light muted-text-on-surface  #5c5c5c on #f2f2f2 =  5.97:1 (min 4.5:1)
PASS  light link                   #000000 on #ffffff = 21.00:1 (min 4.5:1)
PASS  light primary-fill-label     #ffffff on #000000 = 21.00:1 (min 4.5:1)
PASS  light secondary-fill-label   #000000 on #e5e5e5 = 16.67:1 (min 4.5:1)
PASS  light accent-text            #6b5a2a on #ffffff =  6.73:1 (min 4.5:1)
PASS  light danger-text            #e11d48 on #ffffff =  4.70:1 (min 4.5:1)
PASS  light success-text           #15803d on #ffffff =  5.02:1 (min 4.5:1)
PASS  light code                   #24292e on #ffffff = 14.67:1 (min 4.5:1)
PASS  light border                 #858585 on #ffffff =  3.69:1 (min 3.0:1)
PASS  light focus-ring             #000000 on #ffffff = 21.00:1 (min 3.0:1)
```

26 pairings, 26 passing.

## Enforcement

`apps/web/test/theme-tokens.spec.ts` runs under `pnpm test`, which CI already
invokes. It is a test rather than an ESLint rule because the offending values
sit inside `className` string literals and Tailwind variant chains that a lint
rule would have to re-lex, and because the same scan has to cover `globals.css`
anyway. It asserts:

- every `[data-theme]` block and **both** `prefers-color-scheme` fallbacks
  declare the complete token set with exactly the values in
  `@portfolio/contracts`;
- `@theme` maps every token to `var(--color-…)` rather than to a literal — a
  literal is baked into the generated utility and pins that token to one theme;
- no source file names a raw hex, `rgb()`, `hsl()`, or `oklch()` colour outside
  a three-entry allowlist, each with a written reason;
- no Tailwind palette utility and no retired token name appears anywhere;
- every allowlist entry still contains a raw colour, so stale exemptions cannot
  accumulate.

`packages/contracts/test/appearance-tokens.spec.ts` asserts the matrix itself,
including a negative case that replays the pre-migration light palette and
confirms the checker reports `muted-text`, `muted-text-on-surface`,
`accent-text`, and `border` as failing rather than passing vacuously.

## Verification run

Run in the Cowork cloud container against `vitest 4.1.10`, `typescript 5.9.3`,
`tailwindcss 4.1.18` — the versions pinned in the workspace.

```text
 Test Files  3 passed (3)
      Tests  59 passed (59)

tsc --noEmit --strict   packages/contracts/src/appearance packages/contracts/src/common   → exit 0
tsc --noEmit --strict   apps/web/test/theme-tokens.spec.ts                                → exit 0
```

The enforcement was checked negatively as well: injecting `text-gray-400` into
one component and drifting one `--color-text-muted` value in the light
`prefers-color-scheme` fallback produced exactly two failures and no others.

The stylesheet was compiled with `tailwindcss 4.1.18` to confirm the vocabulary
generates working utilities. `bg-bg`, `bg-surface`, `bg-primary`, `text-text`,
`text-text-muted`, `text-bg`, `text-accent`, `text-danger`, `text-success`,
`border-border`, `border-primary`, `bg-scrim/70`, and the `hover:`, `focus:`,
`group-hover:`, `placeholder:`, and `backdrop:` variants of them all compile,
and each resolves to `var(--color-…)` rather than to a frozen literal. Tailwind
also emits a self-referential `:root, :host` copy of the `@theme` declarations
inside `@layer theme`; it never applies, because the theme blocks are unlayered
and unlayered declarations outrank every layered one.

## Not proven here

- **No browser ran.** First-paint, hydration agreement, a live
  `prefers-color-scheme` change, keyboard operation, and screen-reader
  behaviour are all still open.
- **The code tokens are declared but unwired.** `--color-code-bg` and
  `--color-code-text` are measured, but no CSS yet selects between Shiki's
  light and dark output, so code blocks render in one theme regardless of the
  selected one. Wiring it depends on Shiki's emitted inline styles, which are
  also a [THEMING.md §8](../../THEMING.md#8-security-notes) item.
- **Nothing was re-rendered.** The five contrast fixes and the Skills card
  change alter how the light theme looks. They have not been viewed.

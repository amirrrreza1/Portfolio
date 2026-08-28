# M8 — the article editor, proven in a browser

Run date: **2026-08-28**  
Result: **1 browser test, passing**  
Commands:

- `pnpm --filter @portfolio/api provision:cms-browser`
- `pnpm --filter @portfolio/web test:e2e:admin -- blog-editor`

The second M8 slice: the authoring surface an owner actually uses. The
[authoring boundary run](M8-blog-authoring-live.md) proved every endpoint
against real PostgreSQL; what only a browser can answer is whether a person can
reach them — whether the checklist appears before the author commits, whether a
warning has to be acknowledged individually, and whether the directive palette
inserts something the renderer accepts rather than something it refuses.

## What shipped

- **`AdminBlogEditor`**, a fifth panel in the content workspace: article list by
  post and locale, frontmatter fields, a Markdown body, the directive palette,
  the publish checklist, and the four state transitions.
- **Autosave**, debounced, writing `PostDraft` only. A newer draft is offered as
  an explicit "load the draft into the editor" action rather than merged into
  what the author is looking at.
- **The preview route**, `/admin/blog/preview/[token]`, rendering the HTML the
  production pipeline produced inside the same `.blog-reading-surface` the
  public article page uses.
- **Slug suggestion** from the title, but only while the slug has never been
  set — an established slug is a public URL, and rewriting it while the author
  fixes a typo in the title would break every existing link.

## The stack under test

| Component | Version / setting                                                       |
| --------- | ----------------------------------------------------------------------- |
| API       | `apps/api` on `http://127.0.0.1:4006`, real Prisma and PostgreSQL 16.13 |
| Web       | `next dev` on `http://localhost:3003`, `PORTFOLIO_DATA_SOURCE=database` |
| Browser   | Chromium 1194 via Playwright                                            |
| Owner     | `provision:cms-browser`, signed in through a real recovery-code flow    |

## The test

One serial flow, because a recovery code is single use and a second sign-in
would prove nothing extra:

| #   | Check                                                                       | Result |
| --- | --------------------------------------------------------------------------- | ------ |
| 1   | A real recovery-code sign-in reaches the workspace as `OWNER`               | pass   |
| 2   | A category and a tag can be created from the panel                          | pass   |
| 3   | A new article gets an id, and the slug is suggested from the title          | pass   |
| 4   | The directive palette inserts a `callout` the renderer accepts              | pass   |
| 5   | Saving succeeds and the publish checklist appears with no blockers          | pass   |
| 6   | Every warning is a separate checkbox, and all of them must be ticked        | pass   |
| 7   | Publishing succeeds and reports the cache invalidation                      | pass   |
| 8   | The preview opens, renders the callout as an `aside`, and carries `noindex` | pass   |

Check 2 is not incidental. The article store refuses an unknown category
outright rather than creating one, so an author who could not create taxonomy
from this panel could never publish anything at all.

## Three defects this run found

### The palette could insert a directive that would not render

`insertDirective` wrote the snippet at the caret. Every directive in the
palette is a **block** construct, and a block that starts mid-line is not a
directive — remark reads it as literal text and the author gets
`:::callout{type="note"}` printed in their published article. The insertion now
opens its own line and leaves one after it. A palette exists to stop an author
writing something the pipeline refuses; one that can produce exactly that is
worse than no palette.

### Every `<select>` in the admin panel was announced with its own options

The shared `Field` primitive wrapped its control in the `<label>`. That works
for an input or a textarea, which contribute no text — and for a `<select>` the
accessible name became the label element's whole text content, options
included. `Role` was announced as "RoleEditorOwner"; `Category` as
"CategoryNo categoryengineering". Every select in the M7 workspace had this.

`Field` now renders the label as a sibling bound by `htmlFor`, generating the
id and injecting it into a single element child, so callers are unchanged.
M7's own browser proof was re-run against it and passes unchanged.

The fault was invisible until this slice because M7's panels had selects but
its test never addressed one by label.

### A refused transition told the author nothing

The API answers a refused publish with the exact blockers and warnings that
caused it — that was built and proven in slice 1. The panel then passed the
error to the shared handler, which collapses every `VALIDATION_FAILED` to
"Check the values you entered." An author was sent back to a checklist that
said everything was fine.

The panel now unpacks the transition fields: _"Every checklist warning must be
acknowledged explicitly. Acknowledge: Missing cover image, Short body,
Untranslated counterpart."_ That message is what diagnosed the run's own
failure — the test had been ticking a subset of the warnings — and it is
exactly what an author needs.

## Re-running this proof

```
pnpm --filter @portfolio/api provision:cms-browser
pnpm --filter @portfolio/web test:e2e:admin -- blog-editor
```

Needs `E2E_ADMIN_BASE_URL` (equal to `WEBAUTHN_ORIGIN`, and a hostname — Chrome
refuses an IP relying party), `E2E_CMS_OWNER_EMAIL`, `E2E_CMS_OWNER_PASSWORD`,
and `E2E_CMS_OWNER_RECOVERY_CODE`. Recovery codes are single use, so
`provision:cms-browser` runs before every browser run.

## What this slice does not do

`.md`/`.mdx` import, article revision restore, and the discovery and SEO
surfaces remain open, as does the scheduled-publication test matrix. The
editor's conflict handling is the API's `409` surfaced as a message; a
side-by-side diff of the two versions is not built.

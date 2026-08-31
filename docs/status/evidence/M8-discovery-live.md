# M8 — discovery, SEO, and final browser regression

Run date: **2026-08-31**

Result: **63/63 live API checks, 45/45 public browser tests, and 2/2 admin browser flows passing**

Together with [the publication proof](M8-publication-live.md), this closes M8.
The earlier authoring, import, and restore reports remain historical evidence;
their scenarios were re-run on the completed implementation.

## Environment and isolation

- Windows, Node 24.13.1, pnpm 11.9.0, Next.js 16.3.0, Playwright 1.62.1.
- Real PostgreSQL **17.11**, from `postgres:17-alpine`, with all seven checked-in
  migrations applied from an empty database and the deterministic structural seed.
- Real MinIO `RELEASE.2025-09-07T16-13-09Z`, a private disposable bucket, and
  Mailpit with reverse DNS disabled (`--smtp-disable-rdns`).
- API compiled with `nest build`; real-stack web built with `next build` and
  served with `next start`. API: `127.0.0.1:3410`; web origin:
  `http://localhost:3310`, with its listener bound to `127.0.0.1`.
- Installed Chrome **151.0.7922.174**, selected with
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; Playwright's pinned browser was not installed.
- Separate `portfolio-m8-verification-*` containers, loopback-only ports,
  generated fixture records, and a disposable owner. Existing databases,
  storage, credentials, and the source archive were not used or changed.

After verification, the disposable API/web processes, all three fixture
containers, their two anonymous data volumes, and temporary bootstrap/environment
files were removed. Fixture data was intentionally discarded and can be recreated
by re-running the proof; no existing service or source data was deleted.

## Live discovery proof

`pnpm --filter @portfolio/api verify:blog` passed **63/63** checks against the
real API, database, and object store. Its first 41 checks re-prove authoring,
import, revisions, lifecycle, conflict safety, and transactional evidence.
Section 9 passed all ten discovery checks:

1. A newly published article is visible to discovery.
2. The taxonomy navigation index contains its category/tag and article count.
3. Category and tag pages list that published article.
4. The taxonomy DTO includes its own published alternate.
5. An unknown term returns `404`.
6. A disabled term returns `404`, not an empty archive.
7. Feed and article-detail DTOs expose identical alternate sets.
8. The summary feed DTO contains no rendered body.
9. Conditional feed requests return `304`.
10. Corrupting the stored source digest removes the article from both feed and
    category discovery; restoring the digest restores valid source integrity.

Section 10 is documented separately in [M8-publication-live.md](M8-publication-live.md).

Section 11 passed six export checks: anonymous access is refused with no-store;
the private Markdown attachment contains saved metadata and source even with a
newer autosave; repeated downloads are byte-identical and accepted by the import
pipeline; a missing locale returns 404; a corrupt digest is refused; and export
adds no article version, revision, invalidation, or content audit event.

## Production-build browser proof

The public suite runs a real production web build against the **contract-validated
fixture API**, not the real database. Its 10 discovery tests passed individually,
then passed again as part of the full **45-test** public regression suite:

- `robots.txt`: canonical sitemap link, public cache policy, no blocked render assets.
- Sitemap index: one sitemap per locale.
- Locale sitemap: published article/category URLs; no admin or cursor URLs.
- Sitemap versus rendered article: the exact same English, Persian, and
  `x-default` link set, including encoded Persian slugs.
- English RSS: MIME/cache headers, self link, permalink GUIDs, safe summaries.
- Persian RSS: its own language and locale-specific article URL.
- Blog index: advertises its working RSS endpoint.
- Category page: article link, canonical, collection and breadcrumb JSON-LD.
- Tag page: reachable by following the article's taxonomy link.
- Unknown taxonomy page: HTTP `404`.

The other 35 tests re-proved the M5 appearance, typography, reduced-motion,
keyboard accessibility, cookie, and CSP regression matrix.

The two admin flows used the **real API, PostgreSQL, and MinIO** with a newly
provisioned recovery code before each run:

- `blog-editor`: author, download saved Markdown while the editor contains an
  unsaved change, parse/reserialize the download, check warnings, publish, preview, reject executable
  MDX, review/confirm a normalized import, compare history, and restore an
  earlier revision without withdrawing the published article — **1/1 pass**.
- `portfolio-cms`: all four portfolio workspace panels and a competing settings
  save that produces a visible stale-version conflict — **1/1 pass**.

## Defects and harness corrections

- Closed the remaining portable-export requirement with an authenticated
  saved-translation attachment and an editor download action. Nine unit tests
  cover deterministic metadata/body round trips, stable taxonomy ordering,
  Persian Unicode, exact locale, lifecycle preservation, and invalid source.
- Explicitly typed sitemap alternates to allow `x-default`; inferred `en | fa`
  element types had prevented the web build/typecheck from passing.
- Corrected tests to the existing shared BCP 47 contract (`en`, `fa`), including
  a genuinely Persian feed fixture rather than an English entry passed as Persian.
- Removed redundant `unknown | null` annotations and sorted taxonomy rows before
  public projection, avoiding unused internal `sortOrder` bindings.
- Excluded `e2e/admin` from the public fixture-backed Playwright project. It had
  tried to collect suites requiring real-stack owner credentials.
- Rendered fixture Markdown before the fixture server announces readiness.
  Cold syntax-highlighter startup had caused the first article request to time
  out and show the controlled unavailable page. Production already renders at save time.
- Formatted 12 existing CMS files with the pinned formatter to close the full
  repository formatting gate; those changes are formatting-only.
- Disabled reverse DNS in **the disposable Mailpit process**. SMTP took about
  10,026 ms with reverse lookup, racing the browser's 10-second expectation.
  Application timeouts and assertions were not relaxed.

## Quality commands and results

```text
pnpm install --frozen-lockfile                 pass; lockfile unchanged
pnpm build                                   pass; all workspaces
pnpm typecheck                               pass; all workspaces
pnpm lint                                    pass
pnpm test                                    817 tests passing
pnpm db:validate                             pass
pnpm format:check                            pass
git diff --check                             pass
pnpm --filter @portfolio/api verify:blog      63/63
pnpm --filter @portfolio/web exec playwright test discovery
                                             10/10
pnpm --filter @portfolio/web exec playwright test
                                             45/45 (includes discovery)
pnpm --filter @portfolio/api provision:cms-browser
pnpm --filter @portfolio/web exec playwright test --config playwright.admin.config.mts blog-editor
                                             1/1
pnpm --filter @portfolio/api provision:cms-browser
pnpm --filter @portfolio/web exec playwright test --config playwright.admin.config.mts portfolio-cms
                                             1/1
```

Unit/integration totals: contracts 343, media 8, auth-core 7, Markdown 26,
migration 31, database 88, web 187, API 127. The database constraint, queue, and
publication suites ran locally; the earlier Prisma-engine restriction did not
apply to this Windows environment.

Non-fatal diagnostics remain: the existing Vite config-loader notice, Next's
`next start`/standalone deployment warning, and stream-closed messages during
rapid browser navigation. All assertions passed. These runs are local milestone
evidence, not a clean-checkout CI run, production deployment, capacity proof,
or independent security review. M9 and the separately recorded caching,
permissions, retention, and M0 gates remain open.

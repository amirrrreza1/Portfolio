# M8 — merged close-out verification

This record preserves the two independent M8 close-out runs that were brought
together when the development branches were merged. The first expanded the
API proof with portable export and a stronger publication matrix; the second
added the generated share-card fallback and caught build-, lint-, locale-, and
sitemap-specific defects. Together they describe the behavior now on `dev`.

## Expanded discovery, export, publication, and browser regression

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

## Share-card and independent running-stack close-out

Run date: **2026-09-04**
Result: **56/56 live API checks, 45/45 public browser checks, 1/1 admin browser
flow, 31/31 M7 regression checks, and 87/87 database tests passing**

This is the run that closes M8. Every slice was already implemented — the last
two, the discovery surfaces and the scheduled-publication matrix, arrived in
`a84b36a` with its own note that neither had been run against a stack. This
report is that run, the five defects it found, and the two limitations it
records rather than hides.

## The stack it ran against

Everything ran against real processes, not fixtures, except where a suite names
its fixture explicitly.

- **PostgreSQL 16.13** (Ubuntu build), port 5433. Production targets 17; the gap
  is noted here rather than papered over. All seven migrations applied with
  `psql --single-transaction` in lexical order, because `prisma migrate deploy`
  cannot run in this environment (below), then `prisma/seed.ts` and
  `migrate:legacy` — 6 media objects, 6 skill categories, 14 projects, 5
  certificates, 35 quotes.
- **Object storage**: a path-style S3 stand-in on `:9100` implementing
  `PutObject`, `GetObject`, `HeadObject` and `DeleteObject`. The API only calls
  those four; signatures are not verified, which is why it never leaves the
  container.
- **SMTP**: a socket sink on `:2525` writing each message to disk.
- **API**: `tsx src/main.ts` on `:4000`, the real Nest application.
- **Web**: `next build` with `API_INTERNAL_ORIGIN=http://127.0.0.1:4000`, served
  from `.next/standalone` on `http://localhost:3000` — the same origin as
  `WEBAUTHN_ORIGIN`, which admin mutations validate the request `Origin`
  against.

## Commands and results

| Command                                                               | Result                                                |
| --------------------------------------------------------------------- | ----------------------------------------------------- |
| `pnpm --filter @portfolio/api verify:blog`                            | **56/56**                                             |
| `pnpm --filter @portfolio/api verify:cms`                             | **31/31** (M7 regression)                             |
| `playwright test appearance-matrix discovery`                         | **45/45** (35 M5 appearance, 10 M8 discovery)         |
| `playwright test --config playwright.admin.config.mts blog-editor`    | **1/1**                                               |
| `pnpm --filter @portfolio/contracts test`                             | 343                                                   |
| `pnpm --filter @portfolio/api test`                                   | 118                                                   |
| `pnpm --filter @portfolio/web test`                                   | 190                                                   |
| `pnpm --filter @portfolio/markdown test`                              | 26                                                    |
| `pnpm --filter @portfolio/media test`                                 | 8                                                     |
| `pnpm --filter @portfolio/database test`                              | **87 (6 files)** — run on the owner's Windows machine |
| `tsc --noEmit` and `eslint` for `@portfolio/api` and `@portfolio/web` | clean                                                 |

`packages/database` is the one suite this container cannot run: three of its
specs build their schema by shelling out to `prisma migrate diff`, and
`binaries.prisma.sh` answers `403` to both the container and the folder bridge —
an organization egress policy, not a transient failure. The same block is why
migrations were applied with `psql`. The suite was therefore run where the CLI
works, and its output is recorded above: `constraints` 34, `content-jobs` 25,
`publication` 7, `concurrency` 6, `articles` 8, `article-restore` 7.

## §9 — discovery surfaces list only what the detail route would serve

From `verify:blog`, against the running API:

- the taxonomy index lists a term with a count it can honour;
- the category and tag pages list the published article, and carry the same
  reciprocal alternates their pages will emit;
- an unknown term is `404`, and a **withdrawn** term stops being a page rather
  than becoming an empty one;
- the feed index and the article page agree on the alternate set exactly;
- the feed index never carries a rendered body, and answers a conditional
  request with `304`;
- a translation whose stored digest no longer matches its stored source
  **leaves every discovery surface together** — feed, sitemap and taxonomy page.

That last check is the one worth the run: it corrupts a digest and then reads
each surface, rather than trusting that one predicate is spread correctly
across four queries.

## §10 — the scheduled path commits exactly once

- a repeated scheduler tick queues no second job for the same translation;
- a retried publication job publishes once and records one revision — including
  the case that loses data if it is wrong: the worker commits the publication
  and dies before settling the job;
- a publication that fails inside its transaction commits nothing at all;
- two schedulers cannot both hold the publication lock, and the lock is
  released when the holder finishes rather than when the process exits.

## The rendered surfaces, as served

```
$ curl http://localhost:3000/robots.txt
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: http://localhost:3000/sitemap.xml

$ curl http://localhost:3000/sitemap.xml
<sitemapindex …>
  <sitemap><loc>http://localhost:3000/en/sitemap.xml</loc></sitemap>
  <sitemap><loc>http://localhost:3000/fa/sitemap.xml</loc></sitemap>
</sitemapindex>

$ curl http://localhost:3000/en/sitemap.xml   # one article entry
  <url>
    <loc>http://localhost:3000/en/blog/the-editor-slice-mtnbde0t</loc>
    <lastmod>2026-09-04T18:55:45.704Z</lastmod>
    <xhtml:link rel="alternate" hreflang="en" href="http://localhost:3000/en/blog/the-editor-slice-mtnbde0t" />
    <xhtml:link rel="alternate" hreflang="x-default" href="http://localhost:3000/en/blog/the-editor-slice-mtnbde0t" />
  </url>

$ curl http://localhost:3000/en/blog/the-editor-slice-mtnbde0t   # the same set
<link rel="canonical" href="http://localhost:3000/en/blog/the-editor-slice-mtnbde0t"/>
<link rel="alternate" hrefLang="en" href="http://localhost:3000/en/blog/the-editor-slice-mtnbde0t"/>
<link rel="alternate" hrefLang="x-default" href="http://localhost:3000/en/blog/the-editor-slice-mtnbde0t"/>
"@type":"BlogPosting" … "inLanguage":"en" … "@type":"BreadcrumbList"

$ curl http://localhost:3000/en/blog/feed.xml
<rss version="2.0" …><channel>
  <title>Blog — Articles</title>
  <language>en</language>
  <atom:link href="http://localhost:3000/en/blog/feed.xml" rel="self" type="application/rss+xml" />
  <item>… <guid isPermaLink="true">…</guid> <pubDate>Fri, 04 Sep 2026 18:55:26 GMT</pubDate> …</item>
</channel></rss>
```

The sitemap's `xhtml:link` group and the page's `hreflang` group are byte
identical because both are generated from one feed-index entry; the browser
suite compares them rather than trusting it.

## Defects this run found

1. **`next build` type-checks what `tsc -p tsconfig.json` does not.** Two
   `alternates.push({ hreflang: "x-default" })` calls were type errors under the
   build's configuration only — the array's element type had been inferred from
   a `Locale` map, so the string that is not a locale could not be pushed. The
   arrays are annotated `SitemapAlternate[]` now. The build also type-checks
   test files, which a later assertion tripped over.
2. **Four lint errors in code that had never been linted**: two
   `unknown | null` return types, which the rule is right to call meaningless,
   and two `_sortOrder` bindings that this configuration does not exempt.
   Sort order now leaves the DTO through a named helper instead.
3. **Three specs asserted `en-US` and `fa-IR`.** The site defines one language
   tag per locale — `bcp47`, `en` and `fa`, per I18N.md §6 — and it is the value
   `lang`, `hreflang`, the feed's `<language>` and JSON-LD's `inLanguage` all
   read. The assertions were corrected to the contract, not the contract to the
   assertions.
4. **`toArticleSitemapUrl` built `loc` from `entry.slug`** rather than from the
   alternate group for the locale it was asked for. In normal use they are the
   same value; pairing a locale with another locale's entry would have published
   a `loc` in the wrong language, silently. It now reads the group.
5. **An article whose author chose no image advertised no `og:image` at all**,
   against SEO.md §3. Closed by generating one (below).

## The generated share card

`/{locale}/blog/{slug}/share-image` renders a 1200×630 PNG from the article's
own title, publication date and author, on the site's dark palette taken from
`THEME_TOKENS` — THEMING.md §3 forbids naming a raw colour in a source file, and
a share card is not an exception to that. `buildPublicArticleMetadata` points
`og:image` at the author's chosen social image or cover when there is one, and
at this route when there is not, so every article has a share image with
declared dimensions and alt text.

Verified as served:

```
$ curl -o card.png .../en/blog/the-editor-slice-mtnbde0t/share-image
status=200  content-type=image/png  1200 x 630
<meta property="og:image" content="…/share-image"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:image:alt" content="The editor slice mtnbde0t"/>
<meta name="twitter:card" content="summary_large_image"/>
```

**Persian is deliberately declined.** The renderer is satori, which lays glyphs
out without a text shaper: it has no Arabic joining and no bidi reordering. A
Persian card was generated, looked at, and rejected — the letters come out
disconnected and in visual order, which is worse than no card, because it is
shown to every reader the article is shared with. `canGenerateShareCard` returns
false for RTL locales, the route `404`s there, and the metadata omits the image
rather than advertising one it will not serve. A Persian article still gets a
card when its author chooses one. Closing this properly means shaping the text
before it reaches satori; it is recorded in M8's status file as a limitation
with a named cause rather than left as a surprise.

## Carried forward, unchanged by this run

Nothing public is served from a shared cache (M4's open item). The new
surfaces set `s-maxage` and are the traffic a shared cache should absorb, so
the Next 16 caching ADR gains a second reason to exist — but it remains an ADR
to write, not a defect in this slice.

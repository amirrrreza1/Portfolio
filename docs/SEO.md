# Blog and portfolio SEO specification

## 1. Principle

Search visibility comes from useful original writing, clear information architecture, crawlable server-rendered pages, strong performance, and trustworthy metadata. Keyword stuffing, hidden text, doorway pages, mass-generated copy, or misleading structured data are prohibited.

Technical SEO enables discovery; it cannot guarantee rankings.

## 2. Route and index policy

All public routes are locale-prefixed per [I18N.md](I18N.md) §2, so every row below exists once per locale.

| Route | Default index policy |
| --- | --- |
| `/<locale>` and public portfolio pages | index, follow |
| `/<locale>/projects` and canonical project details | index, follow |
| `/<locale>/blog` and canonical published posts | index, follow |
| useful category archives with unique copy | index, follow |
| thin/duplicate tag or deep pagination archives | noindex, follow until editorially valuable |
| `/` before locale resolution | `308` redirect, not an indexable page |
| `/admin/**`, previews, drafts, auth, API, webhooks | noindex, nofollow, noarchive and excluded from sitemap |
| internal search results, if added | noindex, follow |

Only canonical, successful, published URLs appear in the sitemap. Redirects, `404`, `410`, preview, filtered, and noindex URLs do not. A translation whose sync state is not `SYNCED` is excluded from newly generated sitemaps and feeds until resolved.

## 3. Page metadata

Next.js generates metadata on the server from published database values:

- unique descriptive `<title>` with a consistent site template
- unique human-written meta description
- absolute canonical URL, which requires `metadataBase` to be set from the configured site URL. **This is currently missing from the application**, so Open Graph and canonical URLs resolve as relative paths and will be wrong in production — a defect to fix, not an addition.
- Open Graph title, description, type, URL, locale, image and image alt text
- `og:locale` per page and `og:locale:alternate` only for an existing published translation
- reciprocal `hreflang` between published translations plus `x-default`, per [I18N.md](I18N.md) §6
- Twitter card fields
- author, published time, modified time, and article tags for posts
- correct icons and web manifest where applicable

The `keywords` meta tag has had no effect on major search engines for many years. It remains an optional owner-editable field for completeness and is not counted as a ranking surface. The eight keywords currently hard-coded in the root layout are migrated as settings, not preserved as a strategy.

Editorial guidance, not hard truncation rules: titles should normally communicate the topic in roughly 50–60 characters; descriptions should usually be useful around 140–160 characters. Meaning and accuracy win over character targets.

Canonical overrides are owner-only, must be absolute HTTPS URLs, and warn when pointing off-site. Pagination uses self-canonicals; page one does not absorb all later pages.

## 4. Structured data

Render validated JSON-LD that matches visible content:

- site/home: `Person` and `WebSite`
- blog post: `BlogPosting` (or `Article`) with headline, description, canonical URL, dates, author, image, publisher/site identity, and `inLanguage` for the rendered locale
- detail/navigation: `BreadcrumbList` when breadcrumbs are visible
- profile/social identities: `sameAs` only for verified owner URLs

Per-locale JSON-LD takes its `headline`, `description`, and `datePublished` from that translation, never from the post's other language. Dates in structured data and `datetime` attributes are ISO 8601 Gregorian even on Persian pages, which display Jalali dates to readers.

Do not mark up ratings, FAQs, employers, qualifications, or claims not visibly supported. In particular, certificate `scoreText` values such as `98/100` MUST NOT be emitted as a `ratingValue`, and certificates MUST NOT be marked up as credentials or qualifications. JSON-LD serialization must escape `<` and never interpolate executable input.

## 5. Blog document quality

The editor provides a pre-publish checklist:

- one clear H1 generated from the post title; content starts at H2
- short unique slug and primary search intent/topic
- original excerpt/meta description
- descriptive headings in logical order
- meaningful internal links to related posts/projects and descriptive external link text
- image alt text that describes informative images; decorative images use empty alt
- optimized cover/social image with known dimensions
- code blocks labeled with language and readable without client JavaScript
- citations to primary sources where claims need support
- reviewed canonical, category, tags, publish date, and scheduled time
- spelling/readability review without flattening the author’s voice

The system computes estimated reading time and a table of contents from rendered headings. These are aids, not ranking claims.

## 6. Rendering and content safety

- Published pages return complete meaningful HTML from the server; article text is not gated behind client fetch/hydration.
- **Navigation must be present in the server-rendered HTML.** The current header renders `null` until mounted and then portals into the document body, so crawlers and no-JavaScript readers see no navigation at all. This is a crawlability defect, not a styling choice, and §7's requirement of a human HTML path to every indexable page depends on fixing it.
- Markdown raw HTML is disabled and MDX is never executed. GFM plus an allowlisted directive set is rendered through a schema-based sanitizer, server-side, at write time. See [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) §8.
- Headings receive deterministic unique IDs, stable across renders, and accessible anchor links.
- Syntax highlighting is performed server-side with Shiki; the full client highlighter is not shipped. `react-markdown` and `shiki` MUST NOT appear in a client bundle.
- External links use safe protocols and appropriate relationship attributes. Sponsored/user-generated link relationships are set if such content is ever introduced.

## 7. Crawl surfaces

- `robots.txt` references the canonical sitemap and blocks no CSS/image assets needed for rendering. None exists today; it is an addition.
- XML sitemap includes canonical URL and accurate `lastmod` based on meaningful published changes, not every request. `lastmod` derives from the translation's realized publish/update time, never from a sync or reconciliation timestamp — a bot commit that only reconciles frontmatter MUST NOT bump `lastmod`.
- Each published translation is its own sitemap entry with `xhtml:link` alternates that match the page's emitted `hreflang` set exactly. Sitemap and page metadata are generated from the same source so they cannot disagree.
- Split sitemaps only when size warrants it; portfolio/blog and per-locale groups may be separate for operations.
- One RSS feed per locale, containing that locale's recent published translations with canonical absolute links, stable IDs, dates, author, and safe summaries/content according to product choice.
- A human HTML navigation path reaches every indexable post; sitemap-only orphan pages are not acceptable.
- Slug changes create one-hop permanent redirects. Redirect loops/chains are tested.
- Removed content returns `410` when intentionally gone or redirects only to a genuinely equivalent page; do not redirect everything to home.

## 8. Performance and page experience

- Use Next.js image/font optimization and reserve media dimensions to avoid layout shifts.
- Keep public reading pages primarily server components and minimize hydration/animation cost.
- Load the Rubik cube, particles, settings modal, admin editor, and other heavy interactive code only where needed. The cube is owner-toggleable per [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md) §2 precisely so the heaviest component can be dropped without a code change.
- Self-host and subset fonts, serve `woff2` only, declare `unicode-range` so Latin pages never download Persian glyphs, and preload only the critical variant for the active family and locale. The repository currently carries 17 JetBrains Mono faces in four formats including IE-only `.eot`; that is to be reduced per [THEMING.md](THEMING.md) §4.
- Appearance changes must not shift layout: font families declare metric-compatible fallbacks, and theme switching changes only colours.
- Set immutable caching for fingerprinted assets and targeted ISR for published content.
- Monitor real-user Core Web Vitals by route/template and keep representative mobile Lighthouse results in CI as regression signals.
- Accessibility semantics, keyboard use, contrast, reduced motion, readable line length, and stable layout are release requirements, not separate from SEO quality.

## 9. Internationalization

English and Persian ship in the first release, not later. Each locale has its own prefixed URLs, correct `lang`/`dir`, bidirectional typography, self-canonical URLs, per-locale sitemaps and feeds, and reciprocal `hreflang` between published translations only. Automatic language redirects must not prevent crawlers or users from reaching either version, and must never apply to a URL that already names a locale.

A Persian article never canonicalizes to its English counterpart — they are different documents for different readers. A locale with no published translation returns `404` rather than serving the other language, which is what keeps this from becoming a duplicate-content problem. Full specification in [I18N.md](I18N.md).

## 10. Validation and monitoring

Automated checks cover:

- one canonical and one H1 on indexable pages, in both locales
- title/description/canonical/OG presence and absolute URLs, with `metadataBase` configured
- `hreflang` reciprocity and absoluteness, `x-default` present, no `hreflang` pointing at an unpublished translation, and sitemap alternates identical to page metadata
- correct `lang` and `dir` per locale
- valid JSON-LD shape with `inLanguage`, without draft data, and without prohibited rating or credential markup
- sitemap/robots/RSS correctness per locale, and exclusion of translations that are not `SYNCED`
- `lastmod` unchanged by a frontmatter-only reconciliation commit
- noindex headers on admin/preview/error/webhook responses
- redirect chain/loop and broken internal-link detection, including per-locale slug redirects
- image alt and dimension checks
- server-rendered navigation present in the HTML response
- no Markdown renderer, sanitizer, or syntax highlighter in any client bundle
- production build budgets and representative Lighthouse regressions

After launch, verify the site in major search-engine webmaster tools, submit the sitemap, watch index/crawl/structured-data reports, and investigate sudden coverage or performance changes. Editorial performance is reviewed by query/page without collecting unnecessary visitor data.

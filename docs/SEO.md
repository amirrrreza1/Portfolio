# Blog and portfolio SEO specification

## 1. Principle

Search visibility comes from useful original writing, clear information architecture, crawlable server-rendered pages, strong performance, and trustworthy metadata. Keyword stuffing, hidden text, doorway pages, mass-generated copy, or misleading structured data are prohibited.

Technical SEO enables discovery; it cannot guarantee rankings.

## 2. Route and index policy

| Route | Default index policy |
| --- | --- |
| `/` and public portfolio pages | index, follow |
| `/projects` and canonical project details | index, follow |
| `/blog` and canonical published posts | index, follow |
| useful category archives with unique copy | index, follow |
| thin/duplicate tag or deep pagination archives | noindex, follow until editorially valuable |
| `/admin/**`, previews, drafts, auth, API | noindex, nofollow, noarchive and excluded from sitemap |
| internal search results, if added | noindex, follow |

Only canonical, successful, published URLs appear in the sitemap. Redirects, `404`, `410`, preview, filtered, and noindex URLs do not.

## 3. Page metadata

Next.js generates metadata on the server from published database values:

- unique descriptive `<title>` with a consistent site template
- unique human-written meta description
- absolute canonical URL
- Open Graph title, description, type, URL, locale, image and image alt text
- Twitter card fields
- author, published time, modified time, and article tags for posts
- correct icons and web manifest where applicable

Editorial guidance, not hard truncation rules: titles should normally communicate the topic in roughly 50–60 characters; descriptions should usually be useful around 140–160 characters. Meaning and accuracy win over character targets.

Canonical overrides are owner-only, must be absolute HTTPS URLs, and warn when pointing off-site. Pagination uses self-canonicals; page one does not absorb all later pages.

## 4. Structured data

Render validated JSON-LD that matches visible content:

- site/home: `Person` and `WebSite`
- blog post: `BlogPosting` (or `Article`) with headline, description, canonical URL, dates, author, image, and publisher/site identity
- detail/navigation: `BreadcrumbList` when breadcrumbs are visible
- profile/social identities: `sameAs` only for verified owner URLs

Do not mark up ratings, FAQs, employers, qualifications, or claims not visibly supported. JSON-LD serialization must escape `<` and never interpolate executable input.

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
- Markdown raw HTML/MDX execution is disabled. GFM is rendered through an allowlisted sanitizer.
- Headings receive deterministic unique IDs and accessible anchor links.
- Syntax highlighting is performed server-side with Shiki; the full client highlighter is not shipped.
- External links use safe protocols and appropriate relationship attributes. Sponsored/user-generated link relationships are set if such content is ever introduced.

## 7. Crawl surfaces

- `robots.txt` references the canonical sitemap and blocks no CSS/image assets needed for rendering.
- XML sitemap includes canonical URL and accurate `lastmod` based on meaningful published changes, not every request.
- Split sitemaps only when size warrants it; portfolio/blog groups may be separate for operations.
- RSS feed contains recent published posts with canonical absolute links, stable IDs, dates, author, and safe summaries/content according to product choice.
- A human HTML navigation path reaches every indexable post; sitemap-only orphan pages are not acceptable.
- Slug changes create one-hop permanent redirects. Redirect loops/chains are tested.
- Removed content returns `410` when intentionally gone or redirects only to a genuinely equivalent page; do not redirect everything to home.

## 8. Performance and page experience

- Use Next.js image/font optimization and reserve media dimensions to avoid layout shifts.
- Keep public reading pages primarily server components and minimize hydration/animation cost.
- Load the Rubik cube, particles, admin editor, and other heavy interactive code only where needed.
- Self-host/subset fonts where licensing allows and preload only critical variants.
- Set immutable caching for fingerprinted assets and targeted ISR for published content.
- Monitor real-user Core Web Vitals by route/template and keep representative mobile Lighthouse results in CI as regression signals.
- Accessibility semantics, keyboard use, contrast, reduced motion, readable line length, and stable layout are release requirements, not separate from SEO quality.

## 9. Internationalization

The first release declares the actual page language (`en` for current content). If Persian content is added later, it receives separate localized URLs, correct `lang`/`dir`, bidirectional typography, self-canonical URLs, and reciprocal `hreflang`. Automatic language redirects must not prevent crawlers or users from reaching either version.

## 10. Validation and monitoring

Automated checks cover:

- one canonical and one H1 on indexable pages
- title/description/canonical/OG presence and absolute URLs
- valid JSON-LD shape without draft data
- sitemap/robots/RSS correctness
- noindex headers on admin/preview/error pages
- redirect chain/loop and broken internal-link detection
- image alt and dimension checks
- production build budgets and representative Lighthouse regressions

After launch, verify the site in major search-engine webmaster tools, submit the sitemap, watch index/crawl/structured-data reports, and investigate sudden coverage or performance changes. Editorial performance is reviewed by query/page without collecting unnecessary visitor data.

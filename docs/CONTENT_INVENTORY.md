# Content inventory and admin coverage

Every piece of content currently visible on the site, where it lives today, and the admin surface that will own it. This document is the checklist behind the claim in [PRODUCT_SPEC.md](PRODUCT_SPEC.md) `ADMIN-004` that nothing requires a source edit. If an item is not in this table, it is not covered.

Counts and file states below were read from the working tree on 2026-08-08.

## 1. Coverage summary

| Area              | Items today                                   | Source today                                                     | Target owner                           |
| ----------------- | --------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| Hero              | 3 strings                                     | frozen in `PageSections.json`; selected `PageSection` at runtime | `PageSection` key `hero`               |
| About Me          | 2 paragraphs + computed age                   | frozen in `PageSections.json`; selected `PageSection` at runtime | `PageSection` key `about`              |
| Skills            | 6 categories, 26 skills                       | `src/DataBase/Skills.json`                                       | `SkillCategory` + `Skill`              |
| Projects          | 14 projects                                   | `src/DataBase/Projects.json`                                     | `Project` + `ProjectSkill`             |
| Certificates      | 5 certificates, 5 PDFs                        | `src/DataBase/Certificate.json` + `public/Certificates/`         | `Certificate` + `MediaAsset`           |
| Daily quotes      | 35 quotes                                     | `src/DataBase/DailyQuote.json`                                   | `Quote`                                |
| Resume            | 1 PDF                                         | `public/resume.pdf`                                              | `ResumeVersion` + `MediaAsset`         |
| Header navigation | 6 anchors + theme control                     | hard-coded in `Header.tsx`                                       | `NavItem` + settings modal             |
| Footer            | copyright, 3 social links, donate link        | hard-coded in `Footer.tsx`                                       | `SiteSettings` + `SocialLink`          |
| Contact form      | labels, recipient, delivery                   | `GetInTouch.tsx` + client EmailJS keys                           | `SiteSettings` + API contact module    |
| Site metadata     | title, description, 8 keywords, author, icons | hard-coded in `app/layout.tsx`                                   | `SiteSettings` + SEO defaults          |
| GitHub statistics | former live client fetch                      | deleted `Utils/getGithubStats.ts`                                | server adapter + `SiteSettings`        |
| Blog              | none yet                                      | —                                                                | Git files + `Post`/`PageSection` index |

## 2. Hero — `PageSection` key `hero`

The frozen legacy Hero used the typed strings `"Hello There!"` and `"I'm Amirreza Azarioun"`, and the subtitle `"A Developer / Student / Learner"`. They are now migrated from `PageSections.json`; `Hero.tsx` consumes the selected strict section DTO.

| Admin field                         | Type                                     | Notes                                                                        |
| ----------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| Typed lines                         | ordered list of short text, translatable | Drives `CodeStyleText`; at least one line required                           |
| Typing speed, deleting speed, pause | integers with bounded ranges             | Ignored when reduced motion is active                                        |
| Subtitle                            | inline Markdown, translatable            | Restricted inline profile per [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) §10 |
| Show Rubik cube                     | boolean                                  | Lets the owner drop the heaviest client component without a code change      |
| Section enabled, sort order         | boolean, integer                         | Shared by all sections                                                       |

## 3. About Me — `PageSection` key `about`

The frozen legacy About section contained two paragraphs, with emphasis applied through `<B>` and `<I>` and age injected from `getAge()`. The exact prose is now migrated as restricted inline Markdown, and `AboutMe.tsx` consumes the selected strict section DTO.

| Admin field | Type                                     | Notes                                                                                |
| ----------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Heading     | short text, translatable                 | Currently the literal `"About Me"`                                                   |
| Body        | inline-Markdown paragraphs, translatable | Replaces the `<B>`/`<I>` components; emphasis, links, inline code only               |
| Birth date  | date                                     | Replaces `NEXT_PUBLIC_BIRTHDAY`; `{{age}}` in the body is substituted at render time |
| Location    | short text, translatable                 | Currently `"Tehran, Iran"`                                                           |
| Role        | short text, translatable                 | Currently `"frontend developer"`                                                     |

**Corrections — complete for the public read path.** `Utils/Age.ts` read the birth date from `process.env.NEXT_PUBLIC_BIRTHDAY`, which had three problems:

- A `NEXT_PUBLIC_*` variable is compiled into the browser bundle, so the exact birth date was published to every visitor whether or not the page displayed it.
- `NEXT_PUBLIC_BIRTHDAY` was not declared in `.env.example`, so a fresh checkout rendered `null` where the age should be — the About Me paragraph read "Hello, I'm Amirreza Azarioun, , years old". A required value absent from the example environment is a setup trap.
- The age was computed at render time from the client's clock, so it could disagree between server and client and could not be cached confidently.

**Fixed in M0.** The value is now the server-only `BIRTH_DATE`, declared in `.env.example`, validated, and computed in UTC by a server component; `AboutMe` drops the clause entirely rather than rendering an empty gap when it is absent. All three problems are closed.

**Done in M2/M4.** Migration version `2026-08-14.page-sections.1` moves the date into `SiteSettings`. The API derives age in UTC and substitutes `{{age}}` before returning the strict DTO; neither the date nor the raw token reaches the web response. The legacy rollback adapter alone retains server-only `BIRTH_DATE` support until the rollback window closes.

`NEXT_PUBLIC_BIRTHDAY` is gone. The three EmailJS keys are the only remaining `NEXT_PUBLIC_*` values besides the API base URL; they are removed when M4 replaces the contact path, and they must be revoked at the provider regardless.

## 4. Skills — `SkillCategory` and `Skill`

`Skills.json` holds 6 categories and 26 skills. Verified: every `technologies` reference in `Projects.json` resolves to an existing skill ID — there are no orphans today, and the migration MUST fail loudly if that ever stops being true.

Current categories: `Languages` (4), `Frameworks & Libraries` (8), `UI & Styling Tools` (5), `Version Control` (2), `Others` (5), `Tools & Deployment` (2).

| Admin field             | Type                     | Notes                                                                                                                 |
| ----------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Category name           | short text, translatable | Unique                                                                                                                |
| Category order, enabled | integer, boolean         | Drag-to-reorder writes the full ordered set                                                                           |
| Skill name              | short text               | Unique after normalization; not translated (proper nouns)                                                             |
| Skill colour            | hex colour               | Validated `#rrggbb`; contrast-checked against both themes because `getTextColor.ts` derives label text colour from it |
| Skill order, enabled    | integer, boolean         |                                                                                                                       |
| Skill category          | reference                | Moving a skill between categories preserves project links                                                             |

**Corrections:** category IDs in the JSON are non-contiguous (1, 2, 3, 6, 7, 8), which is harmless but confirms these are hand-maintained; migration assigns fresh CUIDs and keeps a legacy-ID map for reconciliation. **Three** skills use `#000000` as their colour — `Next.js (App Router)` (202), `shad CN` (306), and `Vercel` (801) — which fails contrast on the dark theme. Earlier revisions of this document said two; the migration preflight reports all three for the owner to re-pick rather than silently adjusting them. Those replacements were selected on 2026-08-15 — `#0070f3`, `#767676`, and `#8b5cd6` — and are applied by the separately versioned `2026-08-15.skill-colors.1` migration. The source JSON still reads `#000000` and is not edited.

## 5. Projects — `Project` and `ProjectSkill`

14 projects in `Projects.json`. Every one currently has `status: "Completed"`.

| Admin field                   | Type                             | Notes                                                                                 |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| Title                         | short text, translatable         |                                                                                       |
| Slug                          | slug                             | Deterministically generated from the title; now used by localized project-detail URLs |
| Summary                       | inline Markdown, translatable    | Maps from `description`                                                               |
| Long description              | Markdown, translatable, optional | New capability for a project detail page                                              |
| Status                        | enum                             | `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `ARCHIVED`                                     |
| Demo URL                      | URL, optional                    |                                                                                       |
| Repository URL                | URL, optional                    |                                                                                       |
| Cover image                   | media reference, optional        | No project images exist today                                                         |
| Technologies                  | ordered skill references         | Maps from the numeric `technologies` array                                            |
| Featured, sort order, enabled | boolean, integer, boolean        | Currently implicit in array order                                                     |
| Started at, completed at      | dates, optional                  | Not present today                                                                     |

**Corrections:**

- `"Completed"` is not a valid enum member. Migration maps it explicitly to `COMPLETED` and **fails** on any unrecognized value rather than coercing it.
- The `Portfolio` project has `"link": "#"`. A placeholder anchor is not a URL. Migration converts `"#"` to null and the field renders as absent, not as a dead link.
- `Taksize` has `"repo": null`, which is legitimate and must stay distinguishable from an empty string.
- Slugs are generated on migration with a collision report. Two projects with similar titles must not silently merge.

## 6. Certificates — `Certificate` and `MediaAsset`

5 certificates in `Certificate.json`, 5 PDFs in `public/Certificates/`.

| Admin field                     | Type                          | Notes                                                                   |
| ------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| Title                           | short text, translatable      |                                                                         |
| Description                     | inline Markdown, translatable |                                                                         |
| Instructor name, instructor URL | short text, URL               | Maps from `teacher`, `teacherLink`                                      |
| Institute name, institute URL   | short text, URL               | Maps from `institute`, `instituteLink`                                  |
| Score                           | short text                    | Free text such as `98/100`; not a number, and not marked up as a rating |
| Issued date                     | date                          | Currently `YYYY/MM/DD` strings; normalized to a real date               |
| Certificate file                | media reference               | Managed PDF upload                                                      |
| Credential URL                  | URL, optional                 | Not present today                                                       |
| Enabled, sort order             | boolean, integer              |                                                                         |

**Correction — a real bug, fixed in M0.** Two `filePath` values disagreed in case with the files on disk:

| JSON value (before M0)    | Actual file | Status                   |
| ------------------------- | ----------- | ------------------------ |
| `/Certificates/Web-1.pdf` | `Web-1.pdf` | was already correct      |
| `/Certificates/web-2.pdf` | `Web-2.pdf` | corrected to `Web-2.pdf` |
| `/Certificates/web-3.pdf` | `Web-3.pdf` | corrected to `Web-3.pdf` |

They resolved only because the development filesystem is case-insensitive; in a Linux container both links returned `404`. `apps/web/test/legacy-assets.spec.ts` now resolves every certificate path segment by segment against the real directory listing, which reproduces the container's case sensitivity on any machine, so the defect cannot silently return.

Migration still matches files case-sensitively, fails on a miss, and records the verified checksum, MIME type, and byte size for each. This is exactly the class of defect that only appears after deployment, and it is why the reconciliation report is a release gate.

Also: `score` MUST NOT be emitted as structured-data `ratingValue`, and certificates MUST NOT be marked up as credentials or qualifications, per [SEO.md](SEO.md) §4.

## 7. Daily quotes — `Quote`

35 quotes with `text` and `author`.

| Admin field         | Type                     | Notes                               |
| ------------------- | ------------------------ | ----------------------------------- |
| Text                | short text, translatable |                                     |
| Author              | short text               | `"Anonymous"` is a legitimate value |
| Source URL          | URL, optional            | Not present today                   |
| Enabled, sort order | boolean, integer         |                                     |
| Pinned              | boolean                  | Forces a specific quote             |

**Correction:** selection MUST be deterministic per UTC day (or the pinned quote), computed server-side. A random pick during rendering produces a server/client mismatch and makes the page uncacheable. Several quotes contain typographic apostrophes (`’`); migration verifies encoding and reports anything suspicious rather than "fixing" text silently.

## 8. Resume — `ResumeVersion` and `MediaAsset`

`public/resume.pdf`, linked from `DownloadResume.tsx` as a static `/resume.pdf` download.

| Admin field        | Type                     | Notes                                                              |
| ------------------ | ------------------------ | ------------------------------------------------------------------ |
| Upload new version | PDF upload               | Verified by magic bytes, size-bounded, quarantined until validated |
| Label              | short text               | e.g. `Frontend CV — August 2026`                                   |
| Public filename    | short text               | Display name in the download; not the storage key                  |
| Activate           | action                   | Atomic single-active transition                                    |
| History            | list                     | Prior versions retained for rollback with upload date and actor    |
| Button label       | short text, translatable | Currently `"Download Resume"`                                      |

**Corrections:** the public URL must remain stable regardless of which version is active, so the download route resolves the active version server-side rather than exposing a storage key. Old versions are retained, not overwritten — replacing a resume today would destroy the previous file. Served with `application/pdf`, `nosniff`, and safe disposition.

## 9. Header navigation — `NavItem`

The frozen header had six anchor buttons (Home, About Me, Skills, Get In Touch, Projects, Certificates), each with a Lucide icon, plus the theme toggle. `Header.tsx` now consumes the selected server DTO and maps only allowlisted targets to authored icons.

| Admin field    | Type                     | Notes                                                                                                                            |
| -------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Label          | short text, translatable | Used as the tooltip and accessible name                                                                                          |
| Target         | section key or route     | Anchor for on-page sections, or a locale-agnostic path such as `/blog` to which the active locale prefix is added at render time |
| Icon           | key from a code registry | Icon names are keys, never arbitrary strings                                                                                     |
| Order, enabled | integer, boolean         |                                                                                                                                  |

**Corrections:** navigation and the six homepage sections now render from ordered enabled database records (or the isolated legacy adapter), and navigation exists in server-rendered HTML. A temporary live disable proved the page omits a disabled section. The migrated section order preserves the legacy visual order; navigation ordering remains independently editable. A blog link must be added once the blog ships, and the theme control now opens the settings dialog from [THEMING.md](THEMING.md) §6.

## 10. Footer — `SiteSettings` and `SocialLink`

`Footer.tsx` hard-codes the copyright line, three social links (GitHub, LinkedIn, `mailto:`), and a donate link to coffeebede.

| Admin field      | Type                                      | Notes                                      |
| ---------------- | ----------------------------------------- | ------------------------------------------ |
| Copyright holder | short text                                | Year is computed, not stored               |
| Tagline lines    | ordered short text, translatable          | Currently the two typed footer strings     |
| Social links     | label, URL, icon key, rel, order, enabled | GitHub, LinkedIn, email today              |
| Donate link      | label, URL, enabled                       | Currently hard-coded; must be disable-able |

**Correction:** the contact address `arazarioun83@gmail.com` appears as a plain `mailto:` in the markup, which is trivially harvested. Once it is a setting, the owner can choose between a `mailto:` link and routing contact through the form only. Every external link already carries `rel="noopener noreferrer"`, which is correct and must be preserved.

## 11. Contact form — `SiteSettings` and the contact module

`GetInTouch.tsx` sent mail from the browser via EmailJS using three `NEXT_PUBLIC_*` values. It now posts to `POST /api/v1/contact` and holds no credential.

| Admin field                                                 | Type                     | Notes                                   |
| ----------------------------------------------------------- | ------------------------ | --------------------------------------- |
| Heading, field labels, placeholders, success and error text | short text, translatable | Currently English literals              |
| Recipient address                                           | email                    | Server-only; never in the client bundle |
| Enabled                                                     | boolean                  | Lets the owner close the form           |
| Retention window                                            | integer days             | Applied to stored message bodies        |

**Corrections — the source half is done, the exposure is not.** `NEXT_PUBLIC_EMAILJS_SERVICE_ID`, `NEXT_PUBLIC_EMAILJS_TEMPLATE_ID`, and `NEXT_PUBLIC_EMAILJS_PUBLIC_KEY` were compiled into the browser bundle and readable by anyone. Delivery has moved to the server-side SMTP adapter, the `@emailjs/browser` dependency and all three variables are gone from the workspace, and the shared submission contract now validates on both sides. **The keys have still not been rotated or revoked at the provider**, and removing them from the code does not invalidate keys already published — every bundle already served still contains them. Server-side throttling derives a client key per request; the honeypot and minimum completion time are not implemented yet.

The `useAutoLang` hook, which sets `lang` on inputs based on whether the value contains Persian characters, is a good instinct and should be kept and generalized once the bilingual UI lands.

## 12. Site metadata — `SiteSettings`

`app/layout.tsx` hard-codes title, description, eight keywords, author, creator, publisher, and icons.

| Admin field                   | Type                     | Notes                           |
| ----------------------------- | ------------------------ | ------------------------------- |
| Site name, title template     | short text, translatable |                                 |
| Default meta description      | short text, translatable |                                 |
| Canonical site URL            | URL                      | Becomes `metadataBase`          |
| Default social image          | media reference          | None exists today               |
| Author/creator/publisher name | short text               |                                 |
| Robots policy flags           | booleans                 |                                 |
| Verification tokens           | short text, optional     | For search-console verification |

**Corrections:**

- ~~`metadataBase` is not set, so Open Graph and canonical URLs resolve as relative paths and will be wrong in production.~~ **Fixed in M0:** it is resolved from `PUBLIC_SITE_URL`, and a production build without that value now fails rather than silently resolving canonicals against `localhost`. The value moves into `SiteSettings` in M7; the environment variable stays, because the origin differs per deployment.
- The `keywords` meta tag has had no effect on major search engines for many years. It is retained only as an optional owner-editable field, and [SEO.md](SEO.md) does not count it as a ranking surface.
- ~~`lang="en"` is hard-coded on `<html>` and must become dynamic per [I18N.md](I18N.md) §5.~~ **Fixed in M4:** both `lang` and `dir` are resolved from the request locale.
- There is no `robots.txt`, `sitemap.xml`, RSS feed, `og:image`, or JSON-LD today. All are additions, not migrations.

## 13. GitHub statistics — server adapter

The browser hook is deleted. `server/github-stats-source.ts` now accepts only
the validated `SiteSettings` username and exact repository allowlist, then
constructs fixed GitHub API requests with time, response-size, redirect,
fresh/stale, and negative-cache bounds. Project cards receive the result in
initial server HTML. The separately versioned migration and production run are
recorded in
[`M4-github-stats.md`](status/evidence/M4-github-stats.md).

| Admin field          | Type       | Notes                                            |
| -------------------- | ---------- | ------------------------------------------------ |
| GitHub username      | short text |                                                  |
| Repository allowlist | list       | Explicit; no wildcard fetching; empty disables   |
| Cache TTL            | integer    | 60–86400 seconds; current migrated value is 3600 |

**Correction delivered:** an unauthenticated client-side call was rate-limited
per visitor IP, leaked the visitor to a third party, and could not be cached.
The server adapter now implements the required allowlist, optional server
authentication, timeout, response-size limit, and bounded unavailable state.

## 14. Not content, but must not be lost

| Item                                                                                | Disposition                                                                                                   |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Rubik cube, particle background, scramble/typing text, smooth scroll, custom cursor | Visual identity. Preserved, made toggle-able, and gated behind reduced-motion per [THEMING.md](THEMING.md) §6 |
| 16 JetBrains Mono faces plus 1 Vazir Code face × 4 formats (68 files)               | Reduced to `woff2` only, subset, with unused weights removed per [THEMING.md](THEMING.md) §4                  |
| Existing route structure `(Home Page)` / `(Other Pages)`                            | Becomes locale-prefixed per [I18N.md](I18N.md) §2, with `308` redirects from every current URL                |
| `not-found.tsx`                                                                     | Kept and made locale-aware, `noindex`                                                                         |
| `Schemas/ContactUsForm.ts`                                                          | Moves to `packages/contracts` so the API and the form validate against one schema                             |

## 15. Migration acceptance

Migration is complete when the reconciliation report shows: 6 skill categories, 26 skills, 14 projects, 5 certificates with 5 checksum-verified PDFs, 35 quotes, 1 active resume, 3 social links, 6 nav items, and every section listed above present and rendering; zero orphan skill references; zero case-mismatched file paths; zero coerced enum values; every generated slug reviewed; and every text field byte-compared against its source with any encoding difference explained. Rollback to JSON reads stays possible until that report is accepted.

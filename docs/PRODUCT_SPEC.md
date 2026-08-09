# Product specification

## 1. Product statement

Turn the existing portfolio into a full-stack personal publishing platform where visitors can browse a fast, indexable **portfolio and bilingual blog**, use their preferred theme across the public site, and read blog content in their preferred font, while the owner can securely manage every visible content section—including the resume file—without editing source code.

Articles are authored and stored as Markdown files in the Git repository. Portfolio content is stored in PostgreSQL. Both are edited from the same admin panel.

## 2. Product goals

- Preserve the current visual identity and public routes during migration.
- Make every portfolio content area editable from an authenticated admin panel, down to the About Me prose and the resume file.
- Publish long-form technical writing in English and Persian, as durable Markdown files with real version history.
- Let a visitor choose a site-wide theme, blog-only font and size, motion, and language without a flash, a layout shift, or an accessibility regression.
- Keep all privileged mutations behind a dedicated API and auditable authorization checks.
- Use a PostgreSQL connection string so local, hosted, and container deployments share one configuration contract.
- Produce reproducible Docker images and a safe database migration workflow.

“Maximum SEO” and “maximum security” are treated as continuous engineering goals, not absolute guarantees. The measurable gates in this specification define what must be achieved before release.

### 2.1 Governing decisions

The four decisions that shape this specification are recorded with rationale and rejected alternatives in [DECISIONS.md](DECISIONS.md):

| Decision | Summary | Detail |
| --- | --- | --- |
| ADR-003 | Git holds article bodies; PostgreSQL holds the operational index | [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) |
| ADR-004 | Markdown plus an allowlisted directive set; no runtime MDX execution | [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) §9 |
| ADR-005 | Per-locale translations of one post, no fallback rendering | [I18N.md](I18N.md) |
| ADR-006 | Visitor-selectable appearance from an owner-defined allowlist | [THEMING.md](THEMING.md) |

## 3. Users and roles

| Role | Capabilities |
| --- | --- |
| Visitor | Read published portfolio content and blog posts; download the active public resume; submit a contact message |
| Editor | Create/edit/preview blog and portfolio content but cannot manage users, credentials, or destructive system settings |
| Owner | All editor actions plus publish/unpublish, restore revisions, manage media/resume, users, sessions, security settings, and audit logs |

The first production release may provision only one `OWNER`; the role model still exists so authorization is explicit rather than based on hidden UI.

## 4. Public experience requirements

### PORT-PUB-001 — Portfolio content

The home page MUST render all enabled sections from persisted content: hero, introduction/about text, skills, projects, certificates, daily quotes, contact configuration, social links, and resume call-to-action. The owner MUST be able to reorder and enable/disable sections.

### PORT-PUB-002 — Stable migration

Current URLs, assets, and visual behavior MUST remain valid until their database-backed equivalents are verified. Changed public URLs MUST receive permanent redirects.

### PORT-PUB-003 — Projects and skills

Visitors MUST be able to browse projects with title, description, status, repository/demo links, image, featured state, sort order, and associated technologies. Skills MUST be grouped into ordered categories.

### PORT-PUB-004 — Resume

The public resume link MUST always resolve to the single active resume version. Replacing a resume MUST be atomic, retain prior metadata for rollback, and never expose the storage credential or internal object key.

### PORT-PUB-005 — Contact

Contact submission MUST be server-side, validated, rate-limited, protected against automated abuse, and independent of public client-side email credentials. A generic response MUST not reveal mail-provider or account details.

The current browser-side EmailJS integration MUST be removed and its published keys revoked at the provider, since removing a `NEXT_PUBLIC_*` value from source does not invalidate a key that has already shipped.

### PORT-PUB-006 — Appearance settings

A settings modal MUST let a visitor choose a site-wide theme, motion preference, and language, plus a blog font family and blog text size, from the options the owner has enabled. Blog typography MUST apply only to the blog content area and MUST NOT restyle the portfolio, shared header/footer/navigation, settings UI, or admin UI. The chosen appearance MUST be present in the first server-rendered HTML response — no flash of the wrong theme and no post-hydration correction. The site MUST remain readable and correctly themed with JavaScript disabled. Appearance MUST NOT fragment the public cache. Details in [THEMING.md](THEMING.md).

### PORT-PUB-007 — Bilingual public site

The public site MUST be available in English and Persian at locale-prefixed URLs, with correct `lang`/`dir`, RTL typography for Persian, reciprocal `hreflang` between published translations, and per-locale sitemaps and feeds. Language detection MUST NOT redirect a request that already names a locale. Details in [I18N.md](I18N.md).

### PORT-PUB-008 — Server-rendered navigation

Public navigation MUST be present in the server-rendered HTML. The current header renders nothing until mounted and then portals into the document body, leaving crawlers and no-JavaScript readers with no navigation path.

## 5. Blog requirements

### BLOG-001 — Publishing lifecycle

Every translation MUST independently support `DRAFT`, `SCHEDULED`, `PUBLISHED`, and `ARCHIVED`, so an English article can be live while its Persian translation is still a draft. A scheduled translation becomes public only when its due time has passed **and** the publishing worker has committed the transition transactionally. Publication MUST NOT require a deployment or a successful Git write; see [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) §7.

### BLOG-002 — File-backed storage

Article bodies MUST be stored as `.md` files in the Git repository at `content/blog/<postId>/<locale>.md`, with YAML frontmatter validated against a versioned schema. PostgreSQL MUST hold a derived index — identity, slugs, taxonomy, realized status, blob SHA, and the sanitized render cache — and MUST NOT be the authority for body text. The API MUST NOT serve a body whose render cache does not match the recorded blob SHA.

Direct pushes to `content/` are a supported authoring path and MUST reconcile into the index without manual intervention. Invalid content in the repository MUST NOT change live output or publish itself.

### BLOG-003 — Authoring and preview

The admin editor MUST support Markdown with live preview through the production render pipeline, locally autosaved drafts that never commit, headings, lists, tables, footnotes, links, code blocks with language labels, images with alt text, excerpt, canonical URL, social image, tags, category, SEO title and description, and the directive palette from [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) §9.

Raw HTML MUST be disabled. Runtime MDX execution MUST NOT exist anywhere in the system. Explicit saves MUST use optimistic concurrency against the blob SHA and MUST show a diff on conflict rather than overwriting.

### BLOG-004 — File upload and import

The owner MUST be able to create or update an article by uploading a `.md` or `.mdx` file. Import MUST be a two-step operation: parse, validate, and report — then confirm and commit. Import MUST never be partial. An `.mdx` upload MUST be normalized to `.md`, with imports, exports, JSX expressions, raw HTML, and unmapped components rejected in a line-referenced report. Missing frontmatter MUST be presented as a pre-filled form with inferred values clearly labelled as inferred; nothing may be silently invented.

### BLOG-005 — Bilingual articles

Every article MUST be writable in English and Persian as two translations of one post, each with its own title, slug, excerpt, SEO fields, body file, and status. Exactly one language is shown at a time. A locale with no published translation MUST return `404` with a link to the version that exists — English text MUST NOT be served under a Persian URL. The language switcher MUST offer only locales that exist for that post. Details in [I18N.md](I18N.md) §3.

### BLOG-006 — Discovery

For each locale the public site MUST provide:

- `/<locale>/blog` with paginated published posts
- `/<locale>/blog/<slug>` canonical post pages
- tag and category archives with the crawl policy in [SEO.md](SEO.md)
- an RSS feed per locale
- XML sitemap entries for eligible pages, with `hreflang` alternates matching page metadata exactly
- related-post links selected by explicit tags and categories rather than visitor profiling

### BLOG-007 — Slugs and redirects

Published slugs MUST be unique per locale, human-readable, and stable as a URL identity. Changing a slug creates a one-hop permanent redirect from every prior slug within that locale. Because files are keyed by immutable post ID rather than slug, a slug change MUST NOT move or rewrite any file.

### BLOG-008 — Revision safety

Article bodies carry Git history, which is the primary record. In addition, every index and metadata change MUST create a revision with actor, timestamp, before/after snapshots, and the associated commit SHA. Owners MUST be able to preview and restore a revision without editing the database or the repository by hand; restoring writes a new commit and a new revision rather than rewriting history.

## 6. Admin requirements

### ADMIN-001 — Authentication

The admin area MUST require a password protected with Argon2id and a phishing-resistant WebAuthn/passkey second factor for owner accounts. Recovery codes MUST be single-use, hashed at rest, and displayed only once.

### ADMIN-002 — Session control

Owners MUST be able to view and revoke active sessions. Password/passkey/security changes MUST revoke all other sessions and require recent re-authentication.

### ADMIN-003 — Dashboard

The dashboard MUST show drafts, scheduled content, recent edits, contact-message counts, failed login/security events, and system health without exposing secrets.

### ADMIN-004 — Content management

The panel MUST provide validated create/read/update/delete or archive operations for:

- site settings and SEO defaults
- appearance settings: enabled themes and blog fonts, defaults, blog size steps, motion toggle
- ordered page sections and every editable text field, including the About Me prose and hero lines
- projects and their skills
- skill categories/items
- certificates and certificate files
- daily quotes
- header navigation items and footer social links
- media assets and alt text
- resume versions and active resume
- blog posts and their per-locale translations, categories, tags, and slug redirects
- portfolio field translations, with untranslated fields visibly flagged
- GitHub statistics configuration and repository allowlist

Every item is enumerated field by field, against its current source, in [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md). That table is the acceptance checklist for this requirement.

### ADMIN-005 — Concurrency

Edits MUST use optimistic concurrency. If another session changed a record after the editor loaded it, the API returns `409 CONFLICT` and does not overwrite the newer revision.

For database records the token is the integer `version`. For article bodies the token is the Git blob SHA, and a conflict MUST present a diff. Article bodies MUST NOT be auto-merged.

### ADMIN-006 — Destructive actions

Destructive actions MUST use explicit confirmation. Content SHOULD be archived/soft-deleted first; permanent deletion is owner-only, separately confirmed, audited, and blocked when referenced.

A file removed from the repository MUST NOT silently unpublish an article; it is flagged and requires owner confirmation, so an accidental force-push cannot erase published content.

### ADMIN-007 — Content sync visibility

The dashboard MUST surface content-store health: translations that failed validation on sync, translations missing from Git, frontmatter drift after a scheduled publish, pending or failed bot commits, and the last successful reconciliation time. A degraded content store MUST be visible to the owner rather than silently serving stale output.

## 7. Quality attributes

| Attribute | Release target |
| --- | --- |
| Accessibility | WCAG 2.2 AA for public and admin critical paths |
| Public performance | Lighthouse lab targets: Performance ≥ 90, SEO ≥ 95, Accessibility ≥ 95 on representative mobile runs |
| Availability | Health/readiness endpoints and graceful shutdown; target 99.9% when deployed on suitable infrastructure |
| API correctness | All mutation payloads runtime-validated; OpenAPI contract generated in CI |
| Internationalization | Both locales render with correct `lang`/`dir`; `hreflang` reciprocal for published pairs; no untranslated UI string reaches production |
| Appearance | Every enabled theme passes AA contrast; correct theme and blog typography in the first HTML byte; blog typography never affects non-blog UI; no layout shift on font swap |
| Content integrity | Every published translation matches a file at its recorded blob SHA; reconciliation reports zero unexplained differences |
| Recovery | Automated encrypted backups plus an independent content-repository clone; restore drill documented and tested before production launch |
| Observability | Structured redacted logs, request IDs, health metrics, and actionable error reporting |
| Browser support | Current and previous major versions of evergreen browsers; progressive enhancement for public reading |

Lighthouse scores can vary by environment and do not alone prove ranking, accessibility, or security.

## 8. Analytics and privacy

Analytics are optional. If enabled, they MUST be privacy-preserving, avoid collecting article content or form fields, respect applicable consent requirements, and be documented in a privacy notice. The system MUST work without third-party trackers.

## 9. Non-goals for the first release

- Public user accounts, comments, likes, or newsletters
- Multi-tenant site hosting
- An unrestricted HTML page builder
- Executing user-provided scripts or MDX components, at build time or at runtime
- A WYSIWYG editor that round-trips HTML into Markdown
- Automatic machine translation between locales; every translation is written or reviewed by a human
- Locales beyond English and Persian
- A localized admin panel; the panel is English-only in this release
- Owner-uploaded font files or admin-authored CSS
- Storing media binaries directly in PostgreSQL, or article bodies in PostgreSQL as the authority
- Automatic merge resolution for conflicting article edits
- Real-time collaborative editing
- Automatic AI-generated articles or unreviewed SEO text

## 10. Release acceptance

The release is acceptable when:

1. All current JSON content and files are migrated and reconciled by the deterministic counts and checksums in [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md) §15, with zero case-mismatched paths, zero orphan references, and zero coerced enum values.
2. The public site reads only published data from the API/read layer and preserves required URLs through `308` redirects.
3. The owner can manage every item in ADMIN-004 — verified field by field against the content inventory — without source edits.
4. Draft, scheduled, archived, and preview content cannot be fetched by unauthenticated users in either locale.
5. Security tests and the checklist in [SECURITY.md](SECURITY.md) §15 pass.
6. Blog metadata, structured data, per-locale sitemaps, RSS, canonicals, `hreflang`, and redirects pass automated tests.
7. An article can be authored in the panel, uploaded as a file, edited by a direct push, scheduled, and published — each path producing identical rendered output and a reconciled index.
8. A scheduled article publishes on time with the Git host unreachable, and the resulting frontmatter drift is reported rather than hidden.
9. Both locales render with correct `lang`/`dir`, a missing translation returns `404` rather than falling back, and `hreflang` is reciprocal for every published pair.
10. Every enabled theme passes AA contrast, appearance is correct in the first HTML byte, and public responses do not vary on the preferences cookie.
11. Containers start from a clean checkout, migrations run once, and a restore drill reproduces the site from a database backup plus a repository clone.

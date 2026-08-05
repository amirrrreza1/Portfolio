# Product specification

## 1. Product statement

Turn the existing portfolio into a full-stack personal publishing platform where visitors can browse a fast, indexable portfolio and blog, while the owner can securely manage every visible content section—including the resume file—without editing source code.

## 2. Product goals

- Preserve the current visual identity and public routes during migration.
- Make every portfolio content area editable from an authenticated admin panel.
- Publish long-form technical writing with strong technical SEO and accessible reading UX.
- Keep all privileged mutations behind a dedicated API and auditable authorization checks.
- Use a PostgreSQL connection string so local, hosted, and container deployments share one configuration contract.
- Produce reproducible Docker images and a safe database migration workflow.

“Maximum SEO” and “maximum security” are treated as continuous engineering goals, not absolute guarantees. The measurable gates in this specification define what must be achieved before release.

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

## 5. Blog requirements

### BLOG-001 — Publishing lifecycle

Posts MUST support `DRAFT`, `SCHEDULED`, `PUBLISHED`, and `ARCHIVED`. A scheduled post becomes public only when `publishedAt <= now` and the publishing worker/transaction has confirmed the transition.

### BLOG-002 — Authoring

The admin editor MUST support Markdown with preview, autosaved drafts, headings, lists, tables, links, code blocks, images, alt text, excerpt, canonical URL, Open Graph image, tags, category, and SEO title/description. Raw HTML is disabled by default.

### BLOG-003 — Discovery

The public site MUST provide:

- `/blog` with paginated published posts
- `/blog/[slug]` canonical post pages
- tag and category archives with crawl policy defined in [SEO.md](SEO.md)
- RSS feed
- XML sitemap entries for eligible pages
- related-post links selected by explicit tags/categories rather than visitor profiling

### BLOG-004 — Slugs and redirects

Published slugs MUST be unique, lowercase, human-readable, and immutable as a URL identity. Changing a slug creates a permanent redirect from every prior slug.

### BLOG-005 — Revision safety

Every published content change MUST create a revision with actor, timestamp, previous data, and new data. Owners MUST be able to preview and restore a revision without directly editing the database.

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
- ordered page sections and editable text
- projects and their skills
- skill categories/items
- certificates and certificate files
- daily quotes
- navigation and social links
- media assets and alt text
- resume versions and active resume
- blog posts, categories, tags, and redirects

### ADMIN-005 — Concurrency

Edits MUST use optimistic concurrency. If another session changed a record after the editor loaded it, the API returns `409 CONFLICT` and does not overwrite the newer revision.

### ADMIN-006 — Destructive actions

Destructive actions MUST use explicit confirmation. Content SHOULD be archived/soft-deleted first; permanent deletion is owner-only, separately confirmed, audited, and blocked when referenced.

## 7. Quality attributes

| Attribute | Release target |
| --- | --- |
| Accessibility | WCAG 2.2 AA for public and admin critical paths |
| Public performance | Lighthouse lab targets: Performance ≥ 90, SEO ≥ 95, Accessibility ≥ 95 on representative mobile runs |
| Availability | Health/readiness endpoints and graceful shutdown; target 99.9% when deployed on suitable infrastructure |
| API correctness | All mutation payloads runtime-validated; OpenAPI contract generated in CI |
| Recovery | Automated encrypted backups; restore drill documented and tested before production launch |
| Observability | Structured redacted logs, request IDs, health metrics, and actionable error reporting |
| Browser support | Current and previous major versions of evergreen browsers; progressive enhancement for public reading |

Lighthouse scores can vary by environment and do not alone prove ranking, accessibility, or security.

## 8. Analytics and privacy

Analytics are optional. If enabled, they MUST be privacy-preserving, avoid collecting article content or form fields, respect applicable consent requirements, and be documented in a privacy notice. The system MUST work without third-party trackers.

## 9. Non-goals for the first release

- Public user accounts, comments, likes, or newsletters
- Multi-tenant site hosting
- An unrestricted HTML page builder
- Executing user-provided scripts or MDX components
- Storing media binaries directly in PostgreSQL
- Real-time collaborative editing
- Automatic AI-generated articles or unreviewed SEO text

## 10. Release acceptance

The release is acceptable when:

1. All current JSON content and files are migrated and reconciled by deterministic counts/checksums.
2. The public site reads only published data from the API/read layer and preserves required URLs.
3. The owner can manage every item listed in ADMIN-004 without source edits.
4. Draft/scheduled/private content cannot be fetched by unauthenticated users.
5. Security tests and the checklist in [SECURITY.md](SECURITY.md) pass.
6. Blog metadata, structured data, sitemap, RSS, canonical links, and redirects pass automated tests.
7. Containers start from a clean checkout, migrations run once, and restore procedures have been exercised.

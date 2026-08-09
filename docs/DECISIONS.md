# Architecture decision record

Each decision is dated, has an owner-approved status, and lists what was rejected and why. A decision may only be changed by adding a superseding entry; entries are never edited into silence.

| ID | Decision | Status | Date |
| --- | --- | --- | --- |
| ADR-001 | Modular monorepo with separate Next.js web and NestJS API | Accepted | 2026-08-05 |
| ADR-002 | PostgreSQL as the operational source of truth, accessed only by the API | Accepted | 2026-08-05 |
| ADR-003 | Git repository is the source of truth for article bodies | Accepted | 2026-08-08 |
| ADR-004 | Markdown with an allowlisted directive set; no runtime MDX execution | Accepted | 2026-08-08 |
| ADR-005 | Bilingual articles as per-locale translations of one post, no fallback rendering | Accepted | 2026-08-08 |
| ADR-006 | Site-wide theme and blog-only typography from an owner-defined allowlist | Accepted | 2026-08-08 |
| ADR-007 | Portfolio content is database-backed and fully admin-editable | Accepted | 2026-08-05 |

---

## ADR-003 — Git repository is the source of truth for article bodies

**Status:** Accepted, 2026-08-08.

### Context

Article bodies must exist as real `.md` files, be writable from the admin panel, and be importable by uploading a file. Four storage locations were considered: S3-compatible object storage, the Git repository, a mounted disk volume, and a PostgreSQL column with file import/export.

### Decision

The Git repository at `origin` holds the canonical article body files under `content/`. PostgreSQL holds a **derived index** of every article: identity, slug history, taxonomy, status, timestamps, the Git blob SHA of each translation, and the sanitized render cache. The database is authoritative for *operational* state; Git is authoritative for *text*.

Writes go one direction only: admin panel → API → Git commit → webhook → API sync → database index → cache invalidation. The API never edits the index row for body content without a corresponding commit, and never serves a body that does not match a recorded blob SHA.

Publishing does **not** require a redeploy. The web app reads the index and render cache through the API, not the local filesystem at build time. This is the critical constraint that makes a Git content store viable here.

### Rationale

- Real version history, diffs, blame, and pull requests come free, for the content the owner cares most about.
- The owner can write in a local editor and push, or write in the admin panel, and both paths converge.
- A repository clone is a complete, portable, human-readable content backup with no vendor dependency.
- Article text is low-volume and low-write-rate, which is exactly the workload Git handles well.

### Rejected alternatives

- **S3 object storage.** Operationally simpler and the usual recommendation, but gives no diff or history without building versioning by hand, and makes local authoring awkward.
- **Mounted disk volume.** Ties content to one host, needs its own backup story, and turns every path into an attack surface.
- **PostgreSQL column with import/export only.** Least new machinery, but the requirement that content *be* files would only be half met.

### Consequences and accepted risks

1. **A write-scoped Git credential becomes a high-value secret.** Mitigated by a GitHub App installation token scoped to one repository with contents write only, short-lived, server-only, never in the web bundle. See [SECURITY.md](SECURITY.md) §16.
2. **The Git host becomes a availability dependency for authoring.** Reads are unaffected — they come from the database index. When Git is unreachable, saving returns a clear `503` and the editor keeps the local autosave draft. Publishing already-synced content still works.
3. **Two writers can diverge.** Handled by treating the blob SHA as the optimistic-concurrency token and reconciling through the webhook. See [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) §6.
4. **Scheduled publishing needs care**, because the moment of publication is a database event while frontmatter is a file. Handled by the intent/realization split and a bot reconciliation commit. See [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) §7.
5. **Commit metadata is public.** Commit messages and author identity are visible in a public repository, so they must never contain draft text, contact messages, or security details. Bot commits use a fixed message template.
6. **Rate limits apply.** Git host API limits are respected with a queue, backoff, and batching of rapid successive saves. Autosave never commits; only explicit saves do.

---

## ADR-004 — Markdown with an allowlisted directive set; no runtime MDX execution

**Status:** Accepted, 2026-08-08.

### Context

The owner asked whether `.md` or `.mdx` is better, and wants rich articles without weakening security.

### Decision

Store and author **Markdown (GFM)**. Extend it with a closed set of block and inline **directives** (`::callout`, `::figure`, `::video`, `::details`, `::steps`) using the `remark-directive` syntax, each mapped to a reviewed React component with a validated attribute schema. Render server-side and sanitize the resulting HTML against a schema allowlist.

`.mdx` uploads are **accepted** as an input format for convenience: the importer parses them, converts recognized JSX component calls to equivalent directives where a mapping exists, and rejects the file with a precise report when it contains imports, exports, expressions, or unmapped components. Stored files always use the `.md` extension.

### Why `.md` is the better answer here

MDX's value is that a document can import and execute arbitrary JavaScript. That is precisely the property that makes it unsuitable for content that arrives through an admin panel or a file upload when security is the stated priority:

- An MDX document is a program. There is no sanitizer for a program — the security boundary becomes "do you fully trust every author forever," which is not a boundary that survives a stolen session.
- MDX must be compiled. Compiling at request time means running a compiler on submitted input; compiling at build time means every article edit is a deployment, which defeats scheduled publishing.
- Sanitizable HTML output is what makes the SEO and accessibility guarantees in [SEO.md](SEO.md) automatically testable. Arbitrary components break that.
- Directives recover essentially all of the authoring richness — callouts, embeds, figures with captions, step lists — with a fixed, reviewable component surface and zero user-authored code execution.

Markdown is also the more durable format: a `.md` file renders correctly in GitHub, any editor, and any future tool. An `.mdx` file is only meaningful inside this application's component set.

### Rejected alternatives

- **Full MDX compiled at build time.** Real component imports, but authoring becomes a deploy and the sanitizer guarantee is lost.
- **MD for editors, MDX for the owner in an isolated worker.** Most flexible, but doubles the render pipeline and the test matrix for one person's convenience, and the isolation boundary would need continuous verification.

### Consequences

Raw HTML in Markdown stays disabled. A new directive requires a code change, a schema, an accessibility review, and a sanitizer allowlist update — deliberately, so the surface grows only on purpose.

---

## ADR-005 — Bilingual articles as per-locale translations of one post

**Status:** Accepted, 2026-08-08.

### Context

Every article should be writable in English and Persian. Exactly one language is shown at a time; switching language shows the reader's preferred version.

### Decision

One `Post` record carries editorial identity and taxonomy. Each language is a `PostTranslation` row with its own title, slug, excerpt, SEO fields, and body file (`content/blog/<postId>/<locale>.md`). Public URLs are locale-prefixed: `/en/blog/<en-slug>` and `/fa/blog/<fa-slug>`.

**There is no fallback rendering.** A locale with no translation is not served in that locale. The language switcher only offers locales that exist for the current post, and requesting a missing locale returns `404` with a link to the version that does exist.

Publication status is per translation, so the English version can be live while the Persian translation is still a draft.

### Rationale

Fallback rendering produces near-duplicate pages under two URLs, muddies `hreflang`, and shows readers a language they did not ask for. Refusing to serve a missing translation is honest to the reader and unambiguous to a crawler. Sharing one post record keeps tags, category, cover image, and the translation relationship in one place, so a translation pair can never drift apart or lose its `hreflang` partner.

### Rejected alternatives

- **Fall back to English under the `/fa` URL.** Nothing 404s, but it creates duplicate content and dishonest `hreflang`.
- **Fully separate posts linked by a group ID.** Maximum editorial freedom, but the link is advisory and easy to break, and shared taxonomy has to be duplicated.

### Consequences

Persian content requires correct RTL typography, bidirectional-safe rendering of Latin code inside RTL prose, and a Persian-capable font. See [I18N.md](I18N.md).

---

## ADR-006 — Site-wide theme and blog-only typography from an owner-defined allowlist

**Status:** Accepted, 2026-08-08.

### Context

Visitors should be able to change the site-wide theme and customize typography for reading the blog. A blog typography preference must not restyle the portfolio or shared site interface.

### Decision

The owner defines, in the admin panel, the enabled themes and blog font families and the default for each. Visitors override their own choice in a settings modal. Theme applies across the public site; font family and size apply only to the blog content wrapper and never to shared chrome or non-blog pages. The choice is stored in a first-party cookie that the server reads, so the correct theme and blog typography are present in the first HTML response.

Fonts are self-hosted only, from a code-declared registry. The admin panel enables and orders entries and picks the default; it cannot introduce a new font file or arbitrary CSS. Uploading font files is explicitly out of scope for this release.

### Rationale

A cookie read on the server eliminates the theme flash that a `localStorage` read in an effect cannot avoid. Keeping the font registry in code means no path where admin input becomes a `@font-face` URL or a raw CSS value, which is the failure mode that would turn an appearance feature into an injection vector. The owner still controls the palette and the default without a code change.

### Rejected alternatives

- **Fixed built-in list, no admin control.** Simplest, but the owner cannot change the default or retire an option without a deploy.
- **Owner-uploaded font files with admin-defined theme tokens.** Most powerful, but font-file validation and dynamic CSS generation are real security work with little benefit for a single-owner site.

### Consequences

The appearance cookie must never enter a cache key in a way that fragments the cache uncontrollably. Theme is applied at the root; blog font and size are applied only on the blog reading wrapper, so a single cached HTML document can serve any appearance combination without leaking blog typography into the rest of the site. See [THEMING.md](THEMING.md) §5.

---

## ADR-007 — Portfolio content is database-backed and fully admin-editable

**Status:** Accepted, 2026-08-05. Scope clarified 2026-08-08.

### Context

Everything currently visible on the portfolio is either hard-coded in a component or read from a JSON file in the web bundle: About Me prose, hero strings, skills, projects, certificates, quotes, footer links, and the resume file.

### Decision

All of it moves to PostgreSQL and becomes editable from the admin panel, including the resume PDF and certificate PDFs as managed media. Portfolio content is **not** stored as Markdown files — ADR-003 applies to article bodies only. Short prose fields are stored as validated inline Markdown (emphasis, links, inline code) rendered through the same sanitizer as articles.

Rationale for the split: article bodies are long-form documents whose history matters and whose authoring benefits from files. Portfolio fields are structured records that are queried, sorted, filtered, and joined; expressing them as files would mean reimplementing a database.

Every item is enumerated in [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md) with its target admin field, so "editable in the admin panel" is a checklist rather than an aspiration.

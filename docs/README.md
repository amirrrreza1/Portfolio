# Documentation index

These documents define the approved target. They are normative: where an implementation has diverged, the divergence is recorded as outstanding work rather than adopted as the new specification.

## Start here

| Document                                         | Purpose                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [DECISIONS.md](DECISIONS.md)                     | Architecture decision record: what was chosen, why, what was rejected, and what risks were accepted |
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md)               | Scope, users, requirements, acceptance criteria, and non-goals                                      |
| [ROADMAP.md](ROADMAP.md)                         | Current status, milestone dependencies, delivery gates, risks, and immediate execution queue        |
| [STATUS.md](STATUS.md)                           | Evidence-backed summary and individual status files for every milestone that has started            |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Ordered delivery phases, legacy migration, testing, and definition of done                          |
| [BASELINE_M0.md](BASELINE_M0.md)                 | Frozen pre-stabilization record of the legacy site: routes, content counts, and file hashes         |

## Design specifications

| Document                                     | Purpose                                                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)           | Runtime topology, workspace boundaries, request flows, and engineering rules                                                           |
| [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md)   | Git content store, frontmatter contract, file upload/import, sync and conflict handling, scheduled publishing, and the render pipeline |
| [DATA_MODEL.md](DATA_MODEL.md)               | PostgreSQL entities, relationships, constraints, publishing states, translations, and revisions                                        |
| [API_SPEC.md](API_SPEC.md)                   | Public/admin endpoints, contracts, caching, errors, and concurrency rules                                                              |
| [I18N.md](I18N.md)                           | Locales, routing, per-locale translations, `hreflang`, and RTL typography                                                              |
| [THEMING.md](THEMING.md)                     | Site-wide theme and blog-only typography model, settings modal, flash-free server rendering, and appearance security                   |
| [SEO.md](SEO.md)                             | Technical SEO, structured data, publishing checklist, and measurable targets                                                           |
| [SECURITY.md](SECURITY.md)                   | Threat model, mandatory controls, secure defaults, content-store controls, and release gates                                           |
| [DOCKER.md](DOCKER.md)                       | Container topology, hardening, health checks, migrations, and operations                                                               |
| [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md) | Every current content item, its target admin field, and the defects found in it                                                        |

## What this product is

A bilingual portfolio and blog. Article bodies are Markdown files in the Git repository, editable from the admin panel or by direct push, and importable by upload. Everything currently visible on the portfolio — including the About Me prose, the skill colours, and the resume PDF — becomes editable in the admin panel. Visitors choose their own site-wide theme and language, plus a font and text size for blog content only.

## Priority rules

1. Security requirements use **MUST**, **SHOULD**, and **MAY** in their RFC-style meanings.
2. If an implementation convenience conflicts with [SECURITY.md](SECURITY.md), the security requirement wins.
3. Public read paths must remain cacheable and server-rendered even though admin writes are dynamic. Public reads never touch the Git host.
4. Database access belongs to the API/database workspaces; browser code never receives database credentials. The Git credential belongs to one API module and nothing else.
5. **Git is authoritative for what article text says; PostgreSQL is authoritative for what the site is currently doing with it.** This single rule resolves any ambiguity between the two stores.
6. Rendered HTML is always a cache keyed to its source, never an input and never the only surviving copy.
7. Locale is always explicit — in the URL, in every public API call, and in every cache key. Appearance is never in a cache key.
8. Content migration must be reversible until production verification is complete.

## Status

[ROADMAP.md](ROADMAP.md) is the authoritative status document. [STATUS.md](STATUS.md) and the files in [`status/`](status/) provide the per-milestone evidence, completed work, open gates, and next actions.

Seven workspace packages are built and tested: `contracts`, `database`, `markdown`, `media`, `migration`, `content-store`, and `auth-core`. The web app has a locale-prefixed shell with server-resolved appearance, a public CSP, and a settings dialog; the API exposes a health route and a server-side contact endpoint. M2 is complete: the schema, deterministic seed, legacy portfolio/media migration, reviewed skill-colour normalization, and no-write replay have run against real PostgreSQL and a private MinIO bucket. Legacy JSON remains confined to a single server-only rollback adapter.

The active proof backlog is now M3, M4, and M6: the content store still needs a protected real GitHub branch/App run, M4 needs real reconciled bilingual content plus end-to-end publication invalidation, and M6 needs the API/auth/admin boundary. M5 is complete. See [ROADMAP.md](ROADMAP.md) and [STATUS.md](STATUS.md) for the evidence-backed details.

Defects fixed so far: the undeclared birthday value (now the server-only `BIRTH_DATE`, so a date of birth no longer ships in the client bundle), two case-mismatched certificate paths, the missing `metadataBase`, 17 font faces shipped in four formats where only `woff2` was reachable, two `@font-face` weight collisions that made the ExtraBold faces unusable, a repository-wide formatting failure that would have made the CI format step red on every commit, the theme applied after first paint, and the browser-side EmailJS integration.

Defects documented and still scheduled: the published EmailJS keys — removed from source, but every bundle already served still carries them, so only provider-side revocation removes the exposure — and three skill colours that fail contrast. The server-rendered header and server-side GitHub statistics adapter are now delivered. Remaining defects are tracked in [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md) and scheduled in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

# Documentation index

These documents define the approved target before feature implementation begins.

## Start here

| Document | Purpose |
| --- | --- |
| [DECISIONS.md](DECISIONS.md) | Architecture decision record: what was chosen, why, what was rejected, and what risks were accepted |
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | Scope, users, requirements, acceptance criteria, and non-goals |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Ordered delivery phases, legacy migration, testing, and definition of done |

## Design specifications

| Document | Purpose |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Runtime topology, workspace boundaries, request flows, and engineering rules |
| [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) | Git content store, frontmatter contract, file upload/import, sync and conflict handling, scheduled publishing, and the render pipeline |
| [DATA_MODEL.md](DATA_MODEL.md) | PostgreSQL entities, relationships, constraints, publishing states, translations, and revisions |
| [API_SPEC.md](API_SPEC.md) | Public/admin endpoints, contracts, caching, errors, and concurrency rules |
| [I18N.md](I18N.md) | Locales, routing, per-locale translations, `hreflang`, and RTL typography |
| [THEMING.md](THEMING.md) | Site-wide theme and blog-only typography model, settings modal, flash-free server rendering, and appearance security |
| [SEO.md](SEO.md) | Technical SEO, structured data, publishing checklist, and measurable targets |
| [SECURITY.md](SECURITY.md) | Threat model, mandatory controls, secure defaults, content-store controls, and release gates |
| [DOCKER.md](DOCKER.md) | Container topology, hardening, health checks, migrations, and operations |
| [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md) | Every current content item, its target admin field, and the defects found in it |

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

The repository currently contains documentation, workspace/package scaffolding, the original frontend, and an API health probe. Feature code, the Prisma model, the markdown package, and the content store are intentionally deferred to the implementation phases.

Known defects in the current code, documented rather than silently carried forward: publicly exposed EmailJS credentials, an undeclared `NEXT_PUBLIC_BIRTHDAY` that renders an empty age on a fresh checkout, three case-mismatched certificate paths that only work on a case-insensitive filesystem, a missing `metadataBase`, a client-side-only header that leaves no navigation in the server HTML, a theme applied after first paint, a client-side GitHub statistics fetch, two skill colours that fail contrast, and 17 fonts shipped in four formats. Each is tracked in [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md) and scheduled in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

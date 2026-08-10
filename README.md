# Portfolio Platform

This repository is being migrated from a static Next.js portfolio into a secure **bilingual portfolio and blog** with a full admin panel.

What that means concretely:

- **Blog articles are Markdown files in this repository**, under `content/blog/<postId>/<locale>.md`. They can be written in the admin panel, uploaded as a `.md`/`.mdx` file, or pushed directly with Git — all three paths converge, and publishing never requires a deployment.
- **Every article exists in English and Persian** as two independent translations. One language is shown at a time; a missing translation is a `404` in that language, not a silent fallback.
- **Everything currently on the portfolio becomes editable** in the admin panel — the About Me prose, hero lines, skills and their colours, projects, certificates and their PDFs, quotes, navigation, footer links, site metadata, and the resume file.
- **Visitors choose their own appearance** — site-wide theme, motion, and language plus blog-only font and text size — from options the owner enables, applied in the first server-rendered byte with no flash.

Where the work stands: the shared packages are built — contracts, Prisma schema, Markdown pipeline, media adapters, legacy migration, Git content store, and authentication primitives — and the public site now has a locale-prefixed shell with server-resolved appearance and a server-side contact path. What has not happened is proof: no migration has been run against a real PostgreSQL, no content has been pushed through a real Git branch, and the admin panel and blog do not exist. Portfolio content still comes from the preserved legacy JSON. [docs/ROADMAP.md](docs/ROADMAP.md) tracks which gates are open and why; [docs/BASELINE_M0.md](docs/BASELINE_M0.md) holds the frozen pre-migration record of the legacy site.

## Workspace

| Path                     | Responsibility                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `apps/web`               | Next.js public site (locale-prefixed) and the `/admin` interface                                 |
| `apps/api`               | NestJS/Fastify API scaffold; all authenticated writes and the only Git credential live here      |
| `packages/contracts`     | Shared Zod request/response schemas and TypeScript types                                         |
| `packages/database`      | Prisma schema, migrations, and PostgreSQL client                                                 |
| `packages/markdown`      | Frontmatter schema, directive allowlist, and the server-side render pipeline                     |
| `packages/media`         | Private object-store adapters, magic-byte MIME verification, and content-hash media identity     |
| `packages/migration`     | Legacy JSON preflight, normalization, reconciliation reporting, and the transactional writer     |
| `packages/content-store` | GitHub App authentication, prefix-confined commits, webhook verification, and reconciliation     |
| `packages/auth-core`     | Argon2id hashing, opaque session and CSRF tokens, recovery codes, and WebAuthn challenges        |
| `content/`               | Article bodies as Markdown files — the source of truth for article text. Created in M3           |
| `infrastructure/docker`  | Production and local Docker assets in the implementation phase                                   |
| `docs`                   | Product, architecture, content, i18n, theming, API, security, SEO, and deployment specifications |

## Chosen stack

- Frontend: Next.js 16, React 19, Tailwind CSS 4
- Backend: NestJS 11 with Fastify
- Database: PostgreSQL through `DATABASE_URL`, accessed with Prisma
- Content store: this Git repository, written through a repository-scoped GitHub App token
- Authoring format: GFM Markdown with an allowlisted directive set, sanitized server-side. **MDX is never executed** — see [ADR-004](docs/DECISIONS.md#adr-004--markdown-with-an-allowlisted-directive-set-no-runtime-mdx-execution)
- Validation: Zod contracts shared by the web and API workspaces
- Admin authentication: Argon2id password verification plus WebAuthn/passkeys, opaque server-side sessions, and secure cookies
- Locales: English and Persian, locale-prefixed URLs, reciprocal `hreflang`, RTL typography
- Deployment: separate non-root web/API images with PostgreSQL and MinIO object storage

### Why Markdown and not MDX

MDX's defining feature is that a document can import and execute JavaScript. For content that arrives through an admin panel or a file upload, that turns the security boundary into "do you trust every author forever," which is not a boundary that survives a stolen session. It also forces a choice between compiling at request time (running a compiler on submitted input) and compiling at build time (every article edit becomes a deploy). Markdown plus a fixed directive set gives the same authoring richness — callouts, figures, embeds, step lists — with a reviewable component surface, sanitizable output, and files that still render correctly in GitHub or any other editor. Full reasoning in [DECISIONS.md](docs/DECISIONS.md).

## Requirements

- Node.js 24.13 or later
- pnpm 11.9 or later

## Current commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

`pnpm dev` starts the frontend at `http://localhost:3000`, which redirects to `/en`. Use `pnpm dev:api` for the API at `http://localhost:4000`; it currently serves `GET /api/v1/health` and `POST /api/v1/contact`.

Two commands are explicit-apply and touch real infrastructure, so they are not part of `pnpm dev`:

```bash
pnpm --filter @portfolio/database provision:owner
pnpm --filter @portfolio/database migrate:legacy -- --local-media-root <directory>
```

Both need a reachable PostgreSQL. `migrate:legacy` also needs an object store, records the source checksum so a repeated run is a no-op, and removes any object it created if the transaction fails.

CI runs all of the above on every pull request, plus a full-history secret scan. Every package either has a real test suite or no `test` script — `--passWithNoTests` is deliberately absent, so a green run means assertions ran.

Copy `.env.example` to `.env` only for local development. Never commit real credentials. `PUBLIC_SITE_URL` and `BIRTH_DATE` are required for a production build; the build fails rather than defaulting to `localhost` or rendering an empty age.

## Documentation

Start at [docs/README.md](docs/README.md), use [docs/ROADMAP.md](docs/ROADMAP.md) for current delivery status and milestone gates, then read [docs/DECISIONS.md](docs/DECISIONS.md) for why the design is shaped the way it is. The documents are normative for the next implementation phases, especially the security gates, the content-pipeline rules, and the content migration reconciliation requirements.

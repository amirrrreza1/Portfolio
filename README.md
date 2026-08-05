# Portfolio Platform

This repository is being migrated from a static Next.js portfolio into a secure, database-backed portfolio and publishing platform.

The current change establishes the architecture, documentation, workspace layout, and package boundaries. It intentionally does **not** migrate the existing JSON content or implement the admin and blog features yet; those steps are sequenced in [the implementation plan](docs/IMPLEMENTATION_PLAN.md).

## Workspace

| Path | Responsibility |
| --- | --- |
| `apps/web` | Existing Next.js public site and the future `/admin` interface |
| `apps/api` | NestJS/Fastify API scaffold; all authenticated writes will live here |
| `packages/contracts` | Shared Zod request/response schemas and TypeScript types |
| `packages/database` | Prisma schema, migrations, and PostgreSQL client |
| `infrastructure/docker` | Production and local Docker assets in the implementation phase |
| `docs` | Product, architecture, API, security, SEO, data, and deployment specifications |

## Chosen stack

- Frontend: Next.js 16, React 19, Tailwind CSS 4
- Backend: NestJS 11 with Fastify
- Database: PostgreSQL through `DATABASE_URL`, accessed with Prisma
- Validation: Zod contracts shared by the web and API workspaces
- Admin authentication: Argon2id password verification plus WebAuthn/passkeys, opaque server-side sessions, and secure cookies
- Content: database-backed portfolio sections, projects, skills, certificates, media, resume, and Markdown blog posts
- Deployment: separate non-root web/API images with PostgreSQL and an optional S3-compatible object store

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
```

`pnpm dev` starts the preserved frontend at `http://localhost:3000`. Use `pnpm dev:api` for the API scaffold at `http://localhost:4000`; its only current route is `GET /api/v1/health`.

Copy `.env.example` to `.env` only for local development. Never commit real credentials.

## Documentation

Start at [docs/README.md](docs/README.md). The documents are normative for the next implementation phases, especially the security gates and content migration rules.

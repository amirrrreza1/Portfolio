# Architecture specification

## 1. Decision summary

Use a **modular monorepo with separately deployable web and API applications**. Next.js owns rendering and browser interaction. NestJS/Fastify owns authentication, authorization, validation, persistence, mail, uploads, and audit events. PostgreSQL is the source of truth and is configured by a server-only `DATABASE_URL`.

This keeps public pages server-rendered and SEO-friendly while maintaining a strict privilege boundary around writes and credentials. It also avoids splitting a personal site into premature microservices.

## 2. Runtime topology

```mermaid
flowchart LR
  V["Visitor browser"] --> E["TLS reverse proxy / edge"]
  A["Admin browser"] --> E
  E -->|"public and /admin"| W["Next.js web"]
  E -->|"/api/v1/*"| API["NestJS + Fastify API"]
  W -->|"server-side public reads"| API
  API --> DB[("PostgreSQL")]
  API --> OBJ["S3-compatible object storage"]
  API --> SMTP["SMTP provider"]
  API --> OBS["Logs / error monitoring"]
```

All browser API traffic uses the public site origin and `/api/v1`; the edge routes it to the API. Same-origin routing simplifies cookie and CSRF protections. The database and object store are never browser-accessible.

## 3. Workspace boundaries

```text
portfolio-platform/
├─ apps/
│  ├─ web/
│  │  ├─ public/                  # preserved assets during migration
│  │  └─ src/
│  │     ├─ app/                  # public routes and future /admin route group
│  │     ├─ Components/           # legacy components, migrated feature-by-feature
│  │     └─ features/             # target feature-oriented modules
│  └─ api/
│     └─ src/
│        ├─ modules/              # auth, admin, blog, content, contact, media, health
│        └─ common/               # guards, pipes, filters, interceptors, config
├─ packages/
│  ├─ contracts/                  # Zod schemas and inferred transport types
│  └─ database/                   # Prisma schema/client/migrations only
├─ infrastructure/
│  └─ docker/
└─ docs/
```

Rules:

- `apps/web` MUST NOT import Prisma or database adapters.
- `packages/database` MUST NOT contain HTTP or UI concerns.
- `packages/contracts` MUST remain environment-neutral: no Node-only or browser-only side effects.
- API modules may import database and contracts; the database package never imports an app.
- Shared contracts validate at every untrusted boundary. TypeScript types alone are not validation.
- Public response DTOs MUST be allowlists and must never serialize database records wholesale.

## 4. API module ownership

| Module | Owns |
| --- | --- |
| `auth` | bootstrap owner, login, WebAuthn, recovery, sessions, re-authentication |
| `content` | site settings, sections, projects, skills, certificates, quotes, links, resume metadata |
| `blog` | posts, tags, categories, publishing transitions, revisions, slug redirects, feeds |
| `media` | signed upload flow, MIME verification, metadata, object lifecycle, resume activation |
| `contact` | form validation, anti-abuse, persistence/retention, mail delivery adapter |
| `admin` | admin-specific query composition, audit log access, dashboard summaries |
| `health` | liveness and dependency-aware readiness probes |
| `common` | configuration validation, guards, policies, error mapping, request IDs, redaction |

Each module follows controller → application service → repository/adapter. Controllers contain transport concerns only. Business rules and authorization decisions are testable outside controllers.

## 5. Read and write flows

### Public read

1. Next.js resolves a public route on the server.
2. It calls a public API/read service with a bounded timeout.
3. The API selects only published, enabled fields.
4. Next.js renders HTML, metadata, and JSON-LD and assigns an explicit cache/revalidation policy.
5. Publication mutations trigger targeted cache invalidation by signed server-to-server request.

Public pages MUST fail safely: a dependency outage renders a controlled error/stale page, never drafts or stack traces.

### Admin mutation

1. Browser sends same-origin request with an opaque secure session cookie and CSRF token.
2. Edge and API enforce body-size limits, origin policy, rate limits, authentication, and role/re-auth checks.
3. Zod validates the request; unknown fields are rejected.
4. The service applies an optimistic version check and writes content, revision, and audit event in one transaction.
5. The response returns a public/admin DTO and version; secrets/internal keys remain server-side.
6. Successful publish changes invalidate affected Next.js routes.

## 6. Rendering and caching

- Blog posts and portfolio pages use server components and server-rendered metadata.
- Published content may use ISR with tagged invalidation; drafts and admin pages use `no-store`.
- Authentication state MUST never participate in a shared public cache key.
- Public API reads use `ETag`/conditional requests where useful.
- A short stale window is acceptable for published copy after edits; security-sensitive changes (unpublish, resume revocation) require immediate invalidation.
- Preview URLs are authenticated, short-lived, unguessable, `noindex`, and `no-store`.

## 7. Configuration

The API validates environment variables at startup and exits on missing/invalid required values. The connection contract is:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
```

The value is a secret. It appears only in the API/migration process environment, never in a `NEXT_PUBLIC_*` variable, browser bundle, log, image layer, or repository file. Production SHOULD use a secret manager and a restricted application database role; migrations use a separate elevated role when the platform supports it.

## 8. Error contract and observability

- Every request gets or propagates an opaque request ID.
- Logs are structured JSON in production and redact cookies, authorization data, tokens, passwords, database URLs, form messages, email addresses where not operationally required, and object-storage signatures.
- Client errors use stable machine codes; internal causes remain in server logs.
- Expected validation/auth errors are not reported as system failures.
- Health endpoints contain no version, environment, hostname, credentials, or dependency addresses.

## 9. Engineering rules

- Pin direct dependency versions and commit `pnpm-lock.yaml`.
- Run lint, typecheck, unit/integration tests, production builds, audit, migration validation, and secret scanning in CI.
- Database changes use reviewed migrations; production never uses schema push.
- Timestamps are UTC in storage and ISO 8601 at transport boundaries.
- IDs are non-sequential UUIDs/CUIDs at public boundaries.
- Deletion and publishing operations are transactional and idempotent where retries are possible.
- Third-party services sit behind adapters so mail, object storage, and monitoring can change without rewriting domain logic.

## 10. Architecture decisions deferred to implementation

- Production hosting provider and reverse proxy product
- S3-compatible provider (local Docker may use MinIO)
- Error-monitoring vendor
- Whether scheduled publishing uses a platform cron trigger or a dedicated worker process

These choices may change adapters or deployment files but MUST NOT weaken the boundaries above.

# Architecture specification

## 1. Decision summary

Use a **modular monorepo with separately deployable web and API applications**. Next.js owns rendering and browser interaction. NestJS/Fastify owns authentication, authorization, validation, persistence, mail, uploads, content-store access, and audit events.

There are **two stores with clearly divided authority**:

- **PostgreSQL** is authoritative for portfolio content, identity, taxonomy, and all operational state, configured by a server-only `DATABASE_URL`.
- **The Git repository** is authoritative for article body text, per [ADR-003](DECISIONS.md#adr-003--git-repository-is-the-source-of-truth-for-article-bodies). PostgreSQL holds a derived index of it.

This keeps public pages server-rendered and SEO-friendly while maintaining a strict privilege boundary around writes and credentials. It also avoids splitting a personal site into premature microservices.

The single rule that resolves ambiguity between the two stores: **Git is authoritative for what the text says; PostgreSQL is authoritative for what the site is currently doing with it.**

## 2. Runtime topology

```mermaid
flowchart LR
  V["Visitor browser"] --> E["TLS reverse proxy / edge"]
  A["Admin browser"] --> E
  E -->|"public and /admin"| W["Next.js web"]
  E -->|"/api/v1/*"| API["NestJS + Fastify API"]
  W -->|"server-side public reads"| API
  API --> DB[("PostgreSQL")]
  API --> OBJ["MinIO object storage"]
  API --> SMTP["SMTP provider"]
  API --> OBS["Logs / error monitoring"]
  API -->|"commit / read by SHA"| GIT["Git host: content repository"]
  GIT -->|"signed webhook"| API
  SCHED["Scheduler: single instance"] --> API
```

All browser API traffic uses the public site origin and `/api/v1`; the edge routes it to the API. Same-origin routing simplifies cookie and CSRF protections. The database, object store, and Git credential are never browser-accessible.

The **scheduler** is a dedicated process mode and exactly one logical instance holds a PostgreSQL advisory lock, so scheduled publication cannot fire once per replica. The **content sync worker** is also a dedicated process and consumes PostgreSQL-backed durable jobs, serialized per post where ordering matters. HTTP API replicas run no background timers. See [ADR-013](DECISIONS.md#adr-013--postgresql-backed-jobs-with-dedicated-sync-and-scheduler-workers).

Reads never touch Git. A public article request is served from the database index and render cache, so Git being unreachable degrades authoring only, never reading.

## 3. Workspace boundaries

```text
portfolio-platform/
├─ apps/
│  ├─ web/
│  │  ├─ public/                  # preserved assets during migration
│  │  └─ src/
│  │     ├─ app/[locale]/         # locale-prefixed public routes
│  │     ├─ app/admin/            # admin route group, not locale-prefixed
│  │     ├─ Components/           # legacy components, migrated feature-by-feature
│  │     ├─ features/             # target feature-oriented modules
│  │     ├─ messages/             # en.json / fa.json UI catalogs
│  │     └─ appearance/           # site theme tokens and blog font registry
│  └─ api/
│     └─ src/
│        ├─ modules/              # auth, admin, blog, content, content-store,
│        │                        # contact, media, appearance, health
│        └─ common/               # guards, pipes, filters, interceptors, config
├─ packages/
│  ├─ contracts/                  # Zod schemas and inferred transport types
│  ├─ database/                   # Prisma schema/client/migrations only
│  └─ markdown/                   # frontmatter schema, directives, render pipeline
├─ content/
│  └─ blog/<postId>/{en,fa}.md    # article bodies; source of truth (ADR-003)
├─ infrastructure/
│  └─ docker/
└─ docs/
```

Rules:

- `apps/web` MUST NOT import Prisma or database adapters.
- `apps/web` MUST NOT read `content/` from the filesystem. It receives rendered HTML through the API.
- `content/` MUST be excluded from the Next.js build trace and from runtime container images. It is data, not source.
- `packages/database` MUST NOT contain HTTP or UI concerns.
- `packages/contracts` MUST remain environment-neutral: no Node-only or browser-only side effects.
- `packages/markdown` owns the frontmatter schema, the directive allowlist, and the render pipeline, and is imported by the API only. Its output is HTML strings; it MUST NOT import React or reach the browser bundle.
- Only the `content-store` module may hold the Git credential or call the Git host. No other module, and no part of the web app, touches it.
- API modules may import database and contracts; the database package never imports an app.
- Shared contracts validate at every untrusted boundary. TypeScript types alone are not validation.
- Public response DTOs MUST be allowlists and must never serialize database records wholesale.
- The site theme token sets and blog font registry are code. Nothing generates CSS from a stored value.
- The single validation stack is Zod. `class-validator` and `class-transformer` currently appear in the API dependencies; they MUST be removed rather than left as a second, divergent validation path.

## 4. API module ownership

| Module          | Owns                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `auth`          | bootstrap owner, login, WebAuthn, recovery, sessions, re-authentication                                                         |
| `content`       | site settings, sections, projects, skills, certificates, quotes, nav/social links, resume metadata, portfolio translations      |
| `blog`          | post/translation index, taxonomy, publishing transitions, revisions, slug redirects, feeds                                      |
| `content-store` | the only holder of the Git credential: commit, read-by-SHA, webhook verification, sync, reconciliation, drift detection, import |
| `appearance`    | enabled site themes/blog fonts, defaults, preference cookie validation against the allowlist                                    |
| `media`         | signed upload flow, MIME verification, metadata, object lifecycle, resume activation                                            |
| `contact`       | form validation, anti-abuse, persistence/retention, mail delivery adapter                                                       |
| `admin`         | admin-specific query composition, audit log access, dashboard summaries, content-store health                                   |
| `health`        | liveness and dependency-aware readiness probes                                                                                  |
| `common`        | configuration validation, guards, policies, error mapping, request IDs, redaction                                               |

Each module follows controller → application service → repository/adapter. Controllers contain transport concerns only. Business rules and authorization decisions are testable outside controllers.

## 5. Read and write flows

### Public read

1. Next.js middleware resolves the locale from the URL prefix and the appearance preferences from the cookie, validating both against allowlists.
2. Next.js resolves a public route on the server.
3. It calls a public API/read service with an explicit `locale` parameter and a bounded timeout.
4. The API selects only published, enabled fields for that locale, and returns the cached sanitized HTML for article bodies.
5. Next.js renders HTML, metadata, `hreflang`, and JSON-LD, sets `lang`/`dir` and the theme attribute on the root element, adds blog font/size attributes only to the blog reading wrapper, and assigns an explicit cache/revalidation policy.
6. Publication mutations trigger targeted, locale-scoped cache invalidation by signed server-to-server request.

Public pages MUST fail safely: a dependency outage renders a controlled error/stale page, never drafts or stack traces. Git is never on this path.

### Article write

1. The admin browser saves; autosave writes only to a database draft row and never commits.
2. The API validates frontmatter, body, and directives against `packages/markdown`, then serializes frontmatter deterministically.
3. The API creates or reuses a durable content-write operation keyed by the request idempotency key.
4. `content-store` commits to the protected dedicated `content` branch with `If-Match` on the known blob SHA and records the operation ID in fixed commit metadata. A stale SHA returns `409` with a diff and writes nothing.
5. On a successful commit, one transaction idempotently updates the index row, render cache, revision, audit event, operation state, and cache-invalidation outbox.
6. If Git succeeds but the transaction or invalidation fails, the webhook/reconciliation worker re-reads the committed blob by SHA and converges without a duplicate revision. See [ADR-012](DECISIONS.md#adr-012--durable-operation-log-idempotent-recovery-and-invalidation-outbox-for-git-writes).

### Content sync

1. The Git host calls a signed webhook; the signature, timestamp window, and nonce are verified before the payload is trusted.
2. The payload is a trigger only. The worker re-reads affected paths from the Git API by commit SHA and validates them from scratch.
3. Valid files update the index, render cache, and revision. Invalid files set a sync-failure flag with a reason, leave live output unchanged, and notify the owner.
4. A scheduled reconciliation job compares every recorded blob SHA against the branch head, so a missed webhook self-heals.
5. Sync never deletes: a missing file is flagged and requires owner confirmation to unpublish.

### Scheduled publish

1. The single scheduler finds due translations.
2. It transactionally sets the realized status and timestamp, writes a revision and audit event, and invalidates routes. The article is live at this moment, with no commit and no deploy.
3. It then enqueues an idempotent bot commit to reconcile the frontmatter. Failure raises visible drift; it never blocks or reverses publication.

### Admin mutation

1. Browser sends same-origin request with an opaque secure session cookie and CSRF token.
2. Edge and API enforce body-size limits, origin policy, rate limits, authentication, and role/re-auth checks.
3. Zod validates the request; unknown fields are rejected.
4. The service applies an optimistic version check and writes content, revision, and audit event in one transaction.
5. The response returns a public/admin DTO and version; secrets/internal keys remain server-side.
6. Successful publish changes invalidate affected Next.js routes.

## 6. Rendering and caching

- Blog posts and portfolio pages use server components and server-rendered metadata. Their HTML shell is dynamic so validated appearance-cookie attributes are correct in the response; expensive public DTOs and rendered content use the shared tagged data cache.
- Markdown parsing, sanitization, and syntax highlighting happen server-side at write/sync time. **No Markdown parser, sanitizer, or highlighter is shipped to the browser.** The `react-markdown` and `shiki` packages currently in the web app's dependencies MUST NOT be used in client components.
- Published content may use ISR with tagged invalidation; drafts and admin pages use `no-store`.
- **Locale is part of every public cache key and invalidation tag.** Publishing a Persian translation must not purge English pages.
- **Appearance is not part of any shared data-cache key.** The dynamic shell emits theme on the root and blog font/size only on the blog reading wrapper. Two visitors may receive different shell attributes while using the same cached public DTO/render payload. Full-page public HTML is not stored in a shared cache and `Vary: Cookie` is prohibited — see [ADR-009](DECISIONS.md#adr-009--dynamic-html-shell-with-shared-cached-public-data-for-visitor-appearance).
- `Vary: Accept-Language` appears only on the bare `/` negotiation response, never on locale-prefixed pages.
- Authentication state MUST never participate in a shared public cache key.
- The render cache is keyed on the blob SHA plus a `rendererVersion` constant, so a sanitizer or highlighter upgrade re-renders everything safely.
- Public API reads use `ETag`/conditional requests where useful.
- Public API outages use only bounded last-known-good published DTOs. Maximum-stale windows and fail-closed routes are defined by [ADR-014](DECISIONS.md#adr-014--bounded-last-known-good-public-reads-during-api-outages); security-sensitive changes require high-priority invalidation.
- Preview URLs are authenticated, short-lived, unguessable, `noindex`, and `no-store`.

## 7. Configuration

The API validates environment variables at startup and exits on missing/invalid required values. The connection contract is:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
```

The value is a secret. It appears only in the API/migration process environment, never in a `NEXT_PUBLIC_*` variable, browser bundle, log, image layer, or repository file. Production SHOULD use a secret manager and a restricted application database role; migrations use a separate elevated role when the platform supports it.

The content store adds a second credential contract:

```text
CONTENT_GIT_PROVIDER=github
CONTENT_GIT_REPO=owner/repo
CONTENT_GIT_BRANCH=content
CONTENT_GIT_APP_ID=...
CONTENT_GIT_INSTALLATION_ID=...
CONTENT_GIT_PRIVATE_KEY=...          # server-only, mounted, never a build arg
CONTENT_GIT_WEBHOOK_SECRET=...       # independent of every other secret
CONTENT_GIT_BOT_NAME=portfolio-bot
CONTENT_GIT_BOT_EMAIL=bot@example.invalid
```

These are subject to the same rules as `DATABASE_URL` and additionally MUST be scoped to a single repository with contents write permission only, as required by [SECURITY.md](SECURITY.md) §16. Startup validation fails closed on a missing or malformed value; the API refuses to serve rather than running with authoring silently broken.

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

MinIO is selected by ADR-008; the dynamic appearance shell, dedicated content branch, partial-failure recovery, worker topology, and public-outage behavior are selected by ADR-009 through ADR-014. The remaining adapter choices and their blocking deadlines are listed in [DECISIONS.md](DECISIONS.md#decision-deadlines-for-remaining-adapters): production host/reverse proxy, v1 editor permissions, retention defaults, error monitoring, and analytics.

Those choices may change adapters or deployment files but MUST NOT weaken the boundaries above. In particular, none may put the Git credential outside `content-store`, put Git on a public read path, expose PostgreSQL or MinIO publicly, vary shared data by appearance, or allow more than one logical scheduler.

## 11. Related specifications

| Topic                                                     | Document                                     |
| --------------------------------------------------------- | -------------------------------------------- |
| Decision rationale and rejected alternatives              | [DECISIONS.md](DECISIONS.md)                 |
| Content storage, frontmatter, sync, render pipeline       | [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md)   |
| Locales, routing, `hreflang`, RTL                         | [I18N.md](I18N.md)                           |
| Site theme, blog typography, settings modal, no-flash SSR | [THEMING.md](THEMING.md)                     |
| Field-level admin coverage of current content             | [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md) |

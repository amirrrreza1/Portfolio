# Architecture specification

## 1. Decision summary

The platform is a modular monorepo containing separately deployable Next.js web and NestJS/Fastify API applications. The API alone owns authentication, authorization, validation, PostgreSQL persistence, article authoring, media access, mail, publication, and audit events.

**PostgreSQL is the sole operational and editorial source of truth**, including complete Markdown article bodies and every localized publication state. MinIO stores binary media. Optional Markdown import/export never creates a second authority. See [ADR-015](DECISIONS.md#adr-015--postgresql-native-article-authoring-and-publication).

## 2. Runtime topology

```mermaid
flowchart LR
  V["Visitor browser"] --> E["TLS reverse proxy / edge"]
  A["Admin browser"] --> E
  E -->|"public and /admin"| W["Next.js web"]
  E -->|"/api/v1/*"| API["NestJS + Fastify API"]
  W -->|"server-side public reads"| API
  API --> DB[("PostgreSQL: portfolio and articles")]
  API --> OBJ["MinIO: binary media"]
  API --> SMTP["SMTP provider"]
  API --> OBS["Logs / error monitoring"]
  SCHED["Publication scheduler"] --> DB
  WORKER["Publication / invalidation worker"] --> DB
  WORKER -->|"signed cache invalidation"| W
```

Browser API traffic uses the public site origin and `/api/v1`; the edge routes it to the API. PostgreSQL, MinIO credentials, signing secrets, and background processes are never browser-accessible.

A dedicated scheduler holds a PostgreSQL advisory lock before enqueuing due publication. A bounded durable publication/outbox worker processes jobs and signed cache invalidations; API replicas run no background timers. No content branch, GitHub App, content webhook, or reconciliation service exists in the runtime topology.

## 3. Workspace boundaries

```text
portfolio-platform/
├─ apps/
│  ├─ web/                 # locale-prefixed public routes and eventual authenticated admin
│  └─ api/                 # NestJS/Fastify HTTP boundary and publication worker
├─ packages/
│  ├─ contracts/           # environment-neutral Zod schemas and transport contracts
│  ├─ database/            # Prisma schema, migrations, repositories, scheduling/outbox
│  ├─ markdown/            # bounded server-only Markdown rendering and safe directives
│  ├─ media/               # object-store adapters, MIME verification, media identity
│  ├─ migration/           # deterministic legacy portfolio migration
│  └─ auth-core/           # password, session, CSRF, and WebAuthn primitives
├─ infrastructure/docker/
└─ docs/
```

Boundary rules:

- `apps/web` never imports Prisma, database adapters, Markdown rendering packages, or server credentials.
- The web application receives strict public DTOs and sanitized rendered article HTML exclusively through the API.
- `packages/database` has no HTTP/UI concerns and never imports an application.
- `packages/contracts` remains environment-neutral and validates every untrusted transport boundary.
- `packages/markdown` is server-only; it owns safe frontmatter import, directive validation, sanitization, and deterministic rendering.
- Public DTOs are explicit allowlists and never serialize database records, raw article Markdown, source digests, internal versions, or drafts wholesale.
- Theme token sets and blog font registries are code-defined allowlists; persisted appearance values cannot generate executable CSS.
- Zod is the sole boundary-validation stack.

## 4. API module ownership

| Module       | Owns                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `auth`       | Owner bootstrap, login, WebAuthn, recovery, sessions, reauthentication.                                                     |
| `portfolio`  | Settings, sections, projects, skills, certificates, quotes, navigation, and portfolio translations.                         |
| `blog`       | PostgreSQL article bodies, translations, taxonomy, revisions, draft/save/publish commands, scheduling, and imports/exports. |
| `appearance` | Approved themes/blog fonts, defaults, and validated visitor preference cookies.                                             |
| `media`      | Signed upload, MIME verification, object metadata, lifecycle, and resume activation.                                        |
| `contact`    | Submission validation, abuse defenses, retention, and mail delivery.                                                        |
| `admin`      | Authenticated admin queries, dashboards, revision history, and audit access.                                                |
| `health`     | Liveness and dependency-aware publication/outbox readiness.                                                                 |
| `common`     | Configuration, guards, policies, error mapping, request IDs, and redaction.                                                 |

Controllers own transport only. Application services own authorization and domain rules; repositories own persistence.

## 5. Read and write flows

### Public read

1. Next.js resolves and validates the URL locale and appearance preferences.
2. Server-rendered routes request strict locale-specific public API DTOs with bounded timeouts.
3. The API selects only published, unarchived translations with complete current-render and source-integrity metadata.
4. Next.js renders reviewed HTML, metadata, alternate-language links, locale direction, and approved appearance attributes.
5. Published content uses locale-scoped tagged caches with signed server-to-server invalidation and bounded last-known-good outage handling.

Drafts, missing translations, outdated renderer output, and internal authoring data fail closed.

### Article authoring

1. An authenticated admin loads a translation and its integer optimistic-concurrency `version`; autosave writes only an author-scoped database draft.
2. Explicit save validates metadata/taxonomy/media, normalizes Markdown, computes SHA-256, and renders reviewed sanitized HTML.
3. One PostgreSQL transaction checks the expected version, writes source and rendered state, increments the version, records a content revision/audit event, and creates an invalidation-outbox item.
4. A stale version returns `409 CONTENT_CONFLICT` without changing the existing article.
5. The background worker signs and delivers cache invalidation with bounded idempotent retries.

Admin authoring endpoints are unavailable until M6 authentication, authorization, session, and CSRF protections are complete.

### Scheduled publication

1. The advisory-lock scheduler finds due database translations and enqueues bounded publication jobs.
2. A worker transaction checks that a translation is still scheduled, due, and render-valid; publishes it, increments the version, writes revision/audit state, and enqueues cache invalidation.
3. The article is live once that transaction commits. Repeated job delivery cannot double-publish.

No Git commit, webhook, external synchronization, or deployment participates in publication.

### Other admin mutations

Authenticated same-origin mutation requests require an opaque secure session cookie, CSRF validation, body-size limits, origin policy, bounded rates, authorization/re-authentication where appropriate, strict Zod validation, optimistic version checks, and transactional revision/audit persistence.

## 6. Rendering and caching

- Public pages use server components, server-rendered metadata, and a dynamic shell with shared tagged public DTO caches.
- Markdown parsing, directive validation, sanitization, and syntax highlighting run server-side when content is saved; none ships to the browser.
- Render integrity binds cached HTML to the normalized source SHA-256 and current `rendererVersion`; unavailable or stale renders fail closed.
- Locale participates in every public cache key and invalidation tag.
- Appearance never participates in a shared data-cache key; theme belongs to the shell and font/size attributes belong only to the blog reading wrapper. Shared HTML cache variance on cookies is forbidden; see [ADR-009](DECISIONS.md#adr-009--dynamic-html-shell-with-shared-cached-public-data-for-visitor-appearance).
- API outage behavior uses bounded last-known-good published DTOs and controlled fail-closed responses under [ADR-014](DECISIONS.md#adr-014--bounded-last-known-good-public-reads-during-api-outages).
- Draft/admin pages use `no-store`; previews are authenticated, short-lived, unguessable, `noindex`, and `no-store`.

## 7. Configuration

The API validates server-only runtime configuration. PostgreSQL uses:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
```

Object-store credentials, authentication secrets, SMTP credentials, and cache-invalidation signing secrets remain server-only. Production should use a secret manager and least-privilege database roles. No article-specific Git provider, branch, app credential, private key, or webhook secret is configured.

## 8. Error contract and observability

- Every request receives or propagates an opaque request ID.
- Structured logs redact cookies, credentials, database URLs, message contents, email addresses unless operationally required, and object-storage signatures.
- Client errors expose stable machine codes while internal causes remain server-side.
- Validation/authentication failures do not leak stack traces.
- Health responses reveal no hostname, dependency address, credential, or deployment detail.

## 9. Engineering rules

- Pin direct dependencies, commit the lockfile, and run lint, typecheck, tests, builds, migration validation, and secret scanning in CI.
- Change production schemas only through reviewed forward migrations; never rewrite an already-applied migration.
- Store UTC timestamps, transport ISO 8601 values, and use nonsequential public IDs.
- Make publication, retries, and invalidation idempotent and transactionally safe.
- Keep third-party mail, media, and monitoring behind reviewed adapters.

## 10. Deferred adapter decisions

MinIO, appearance caching, bounded public outage behavior, and PostgreSQL-native articles are governed by ADR-008, ADR-009, ADR-014, and ADR-015. Hosting, reverse proxy, editor permissions, retention, monitoring, and analytics deadlines remain tracked in [DECISIONS.md](DECISIONS.md#decision-deadlines-for-remaining-adapters).

None may expose PostgreSQL or MinIO publicly, vary shared data by appearance, bypass authorization, or run multiple independent publication schedulers.

## 11. Related specifications

| Topic                                           | Document                                     |
| ----------------------------------------------- | -------------------------------------------- |
| Decision rationale and superseded architecture  | [DECISIONS.md](DECISIONS.md)                 |
| Database-native article authoring and rendering | [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md)   |
| Locales, routing, alternate links, and RTL      | [I18N.md](I18N.md)                           |
| Theme, typography, and accessible settings      | [THEMING.md](THEMING.md)                     |
| Portfolio content and migration inventory       | [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md) |

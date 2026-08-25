# API specification

**Implementation status.** Health, contact, localized public portfolio/article reads, and signed web cache invalidation are implemented. Authenticated admin mutation endpoints remain specified until the M6 authentication, authorization, session, and CSRF security boundary is complete. Existing responses use the shared success/error contracts and request identifiers.

## 1. Protocol

- Base path: `/api/v1`
- Format: JSON UTF-8 except bounded multipart media upload and binary download responses
- Versioning: URI major version; additive changes do not change the version
- Documentation: generated OpenAPI JSON is available only to authenticated owners in production (or emitted as a CI artifact)
- Dates: ISO 8601 UTC strings
- IDs: opaque strings

The reverse proxy serves the API on the same origin as the web app. Production cross-origin credentialed access is disabled.

## 2. Response and error shape

Successful single-resource responses:

```json
{
  "data": {},
  "meta": { "requestId": "opaque-id" }
}
```

List responses add cursor pagination:

```json
{
  "data": [],
  "meta": {
    "requestId": "opaque-id",
    "nextCursor": null
  }
}
```

Errors never expose stack traces or internal exception messages:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request could not be accepted.",
    "fields": { "title": ["Required"] },
    "requestId": "opaque-id"
  }
}
```

Stable codes include `VALIDATION_FAILED`, `AUTHENTICATION_REQUIRED`, `AUTHENTICATION_FAILED`, `CSRF_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA`, and `INTERNAL_ERROR`.

## 3. General rules

- Unknown input fields are rejected on mutations.
- Pagination is cursor-based with server-capped page size (default 20, maximum 100).
- Public list filters use explicit allowlists; arbitrary field sorting/query operators are forbidden.
- Mutation requests require `Content-Type`, a valid CSRF token, authenticated session, role permission, and an `If-Match` version/ETag for existing resources.
- A stale `If-Match` returns `409 CONFLICT` with the current version metadata and makes no write. For article bodies the token is the integer translation version; a conflict returns the current version without changing content.
- **Every public read endpoint takes an explicit, validated `locale` parameter** from the allowlist. There is no implicit default that could silently serve the wrong language, and an unknown locale is `VALIDATION_FAILED`, not a fallback.
- Admin endpoints address a translation explicitly in the path rather than inferring locale from a header.
- `POST` operations that can be retried (upload completion, publish actions, content commits) accept an idempotency key with bounded retention.
- Rate-limit responses include `Retry-After`; detailed thresholds are configuration, not public guarantees.
- Additional stable article error codes: `CONTENT_VALIDATION_FAILED`, `CONTENT_CONFLICT`, and `TRANSLATION_NOT_FOUND`.

## 4. Public endpoints

All public read paths are locale-scoped. `:locale` is validated against the allowlist in [I18N.md](I18N.md) §1.

| Method | Path                                    | Purpose                                                                                    | Cache                                 |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------- |
| `GET`  | `/public/:locale/site`                  | Enabled settings, navigation, sections, social links, public GitHub statistics allowlist   | short ISR/public cache                |
| `GET`  | `/public/:locale/appearance`            | Enabled site themes, blog typography options, and defaults for the settings modal          | long public cache                     |
| `GET`  | `/public/:locale/projects`              | Enabled projects and associated skills                                                     | public cache                          |
| `GET`  | `/public/:locale/projects/:slug`        | One public project                                                                         | public cache                          |
| `GET`  | `/public/projects/:slug/image`          | Verified public image attached to one enabled project; `404` when absent                   | long public cache                     |
| `GET`  | `/public/:locale/blog/posts`            | Published translation summaries, cursor pagination                                         | public cache                          |
| `GET`  | `/public/:locale/blog/posts/:slug`      | One published translation: rendered HTML, heading tree, SEO data, and available alternates | public cache                          |
| `GET`  | `/public/:locale/blog/categories/:slug` | Published posts in category                                                                | public cache                          |
| `GET`  | `/public/:locale/blog/tags/:slug`       | Published posts with tag                                                                   | public cache/noindex policy may apply |
| `GET`  | `/public/:locale/blog/feed-index`       | Ordered published entries for RSS and sitemap generation                                   | public cache                          |
| `GET`  | `/public/resume`                        | Active resume metadata/download location                                                   | short cache                           |
| `POST` | `/contact`                              | Validate, persist, and queue contact delivery                                              | no-store, strict limit                |

Rules:

- Draft, scheduled, archived, disabled, and soft-deleted records MUST behave as `404` on public endpoints, in every locale.
- A post with no `PUBLISHED` translation in the requested locale returns `404` with `TRANSLATION_NOT_FOUND` and, in `meta`, the locales in which it _is_ available — so the web app can render a helpful page without a second request. It MUST NOT return another locale's body.
- The post detail response includes only the alternates that are actually published, and the web app emits `hreflang` from exactly that list.
- Article responses carry pre-rendered sanitized HTML. The API never returns raw Markdown on a public endpoint.
- A translation with missing Markdown/source digest, an invalid digest, or stale renderer provenance is excluded from listings and feed indexes.
- Locale is part of the cache key and the invalidation tag for every entry above.
- RSS, sitemap, robots, and HTML routes are emitted by Next.js from these public read models; they are not alternate write paths.
- The Next.js server client follows [ADR-014](DECISIONS.md#adr-014--bounded-last-known-good-public-reads-during-api-outages): it may reuse only a previously validated published DTO within the endpoint's maximum-stale window. Site/projects default to 60 minutes, article/taxonomy reads to 15 minutes, and resume metadata to 5 minutes. A cold or expired outage renders a localized controlled `503` state.
- For the current home/project/site/appearance/article surfaces, the request proxy evaluates the exact route dependencies before streaming and emits that `503` with `Retry-After`, no-store/noindex controls, the locale catalog message, and no internal cause. Project/article `404` and explicit legacy rollback remain distinct from an outage; article reads use their shorter 15-minute maximum-stale ceiling.
- Contact, preview, authentication, admin, and mutation requests never synthesize success from stale data. Unpublish/archive/resume-revoke changes enqueue high-priority invalidation and expose delivery failures to operations.

## 5. Authentication endpoints

| Method   | Path                     | Purpose                                                               |
| -------- | ------------------------ | --------------------------------------------------------------------- |
| `GET`    | `/auth/csrf`             | Issue/rotate a session-bound CSRF token                               |
| `POST`   | `/auth/login/password`   | Verify password and create a short-lived WebAuthn challenge flow      |
| `POST`   | `/auth/webauthn/options` | Return assertion options for an active login/re-auth flow             |
| `POST`   | `/auth/webauthn/verify`  | Verify assertion and issue/rotate opaque session cookie               |
| `POST`   | `/auth/recovery/verify`  | Consume recovery code under stricter limits and security notification |
| `GET`    | `/auth/session`          | Return minimal current actor/session state                            |
| `POST`   | `/auth/reauthenticate`   | Establish short recent-auth window for high-risk action               |
| `POST`   | `/auth/logout`           | Revoke current session and clear cookies                              |
| `GET`    | `/auth/sessions`         | List current user’s session summaries                                 |
| `DELETE` | `/auth/sessions/:id`     | Revoke a session; recent auth required for another session            |

Initial owner provisioning is a one-time deployment CLI/command with an expiring bootstrap secret, not an always-on public registration endpoint.

Cookies use the `__Host-` prefix in HTTPS production, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, and no `Domain`. Login responses are `Cache-Control: no-store`.

## 6. Admin resource endpoints

The following resource groups use conventional `GET` list/detail, `POST` create, `PATCH` update, and owner-restricted archive/delete operations under `/admin`:

- `/admin/settings`
- `/admin/appearance`
- `/admin/sections`
- `/admin/nav-items`
- `/admin/social-links`
- `/admin/projects`
- `/admin/skill-categories` and `/admin/skills`
- `/admin/certificates`
- `/admin/quotes`
- `/admin/blog/posts`, `/admin/blog/categories`, `/admin/blog/tags`
- `/admin/media`
- `/admin/resumes`
- `/admin/contact-messages`
- `/admin/revisions`
- `/admin/audit-events`
- `/admin/users` (owner only)

Translatable resources expose their translations as explicit subresources, for example `PATCH /admin/projects/:id/translations/:locale`. A translation write carries its own `If-Match` so two locales can be edited concurrently without conflicting.

### Article and translation commands

Article bodies are addressed per translation. Editorial state transitions are commands, not arbitrary status patches:

| Method   | Path                                                   | Rule                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/admin/blog/posts/:id/translations/:locale`           | Returns editorial metadata, raw Markdown, integer version, source digest, and any newer draft                                                                                                                              |
| `PUT`    | `/admin/blog/posts/:id/translations/:locale`           | Explicit save: validate/render Markdown and atomically persist source, metadata, revision, and invalidation outbox. A stale integer version returns `409 CONTENT_CONFLICT` without writing                                 |
| `PUT`    | `/admin/blog/posts/:id/translations/:locale/draft`     | Autosave to `PostDraft` only. Never commits, never publishes, no `If-Match` required                                                                                                                                       |
| `POST`   | `/admin/blog/posts/:id/translations/:locale/preview`   | Render through the production pipeline; returns a short-lived, unguessable, `noindex`, `no-store` preview URL                                                                                                              |
| `POST`   | `/admin/blog/posts/:id/translations/:locale/publish`   | Validate the publish checklist, set realized state, create revision, invalidate that locale's routes, enqueue durable signed cache invalidation                                                                            |
| `POST`   | `/admin/blog/posts/:id/translations/:locale/schedule`  | Future UTC timestamp; commits the intent and mirrors it to the index                                                                                                                                                       |
| `POST`   | `/admin/blog/posts/:id/translations/:locale/unpublish` | Recent auth; immediate invalidation because a withdrawn article left cached is a disclosure issue                                                                                                                          |
| `DELETE` | `/admin/blog/posts/:id/translations/:locale`           | Owner only; blocked while `PUBLISHED`; removes the file by commit and archives the index row                                                                                                                               |
| `POST`   | `/admin/blog/import`                                   | Multipart `.md`/`.mdx` upload. **Dry run by default:** returns the normalized document, a line-referenced report, and the exact diff. Committing requires a second call with `confirm: true` and the returned report token |
| `POST`   | `/admin/revisions/:id/restore`                         | Writes a new commit and a new revision; never mutates history                                                                                                                                                              |
| `POST`   | `/admin/resumes/:id/activate`                          | Atomic single-active update and cache invalidation                                                                                                                                                                         |
| `POST`   | `/admin/media`                                         | Stream bounded upload through verification/quarantine                                                                                                                                                                      |
| `POST`   | `/admin/media/:id/archive`                             | Reject if still referenced unless replacement supplied                                                                                                                                                                     |

### Article publication operations

Authenticated owner-only publication status surfaces expose scheduled jobs, pending/dead-letter cache invalidations, and current source/render integrity. Manual retry is idempotent, rate-limited, and audited. No Git credential, content-reconciliation endpoint, or external webhook exists.

### Background publication boundary

Publication scheduling and invalidation delivery run as dedicated internal processes backed by PostgreSQL. They expose no public HTTP webhook and accept no browser-authenticated mutation requests.

## 7. Upload contract

- Accept only explicit media classes required by the product: PDF resume/certificates, approved raster image formats, and Markdown documents for article import.
- **Markdown import** (`.md`, `.mdx`, `.markdown`) is size-bounded, decoded strictly as UTF-8 with invalid sequences rejected rather than replaced, and validated per [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) §5. It is never partially applied, and the original upload is retained in quarantine for the audit window without ever being served.
- Per-class byte and dimension limits are enforced before/while streaming.
- Extension and browser-supplied MIME are advisory; magic bytes and decoders determine accepted type.
- Filenames are display metadata only. Storage keys are random and cannot contain user paths.
- Images are decoded/re-encoded, metadata stripped, and variants created server-side.
- PDFs are served as non-executable content with safe disposition and isolated object origin where possible.
- Failed/unknown scans stay quarantined and cannot be attached or published.

## 8. Caching and invalidation contract

Public `GET` responses provide `Cache-Control`, `ETag`, `Last-Modified`, and `Content-Language` where meaningful. Admin/auth/contact responses are always `private, no-store`.

Cache keys include the locale and exclude the appearance preferences cookie. `Vary: Cookie` MUST NOT appear on a public response; `Vary: Accept-Language` appears only on the bare `/` negotiation response.

After a committed publish, unpublish, article-save, redirect, or active-resume transaction, the API sends a signed, replay-protected invalidation event to the web app, tagged by locale so one language's publication does not purge the other. Invalidation failure is retried and observable; the database state remains authoritative.

## 9. Authorization matrix

| Action                             | Visitor |                 Editor |             Owner |
| ---------------------------------- | ------: | ---------------------: | ----------------: |
| Read published content             |     yes |                    yes |               yes |
| Read/edit drafts                   |      no |                    yes |               yes |
| Save an article body to PostgreSQL |      no |                    yes |               yes |
| Import a Markdown file             |      no |           dry run only |               yes |
| Publish/schedule content           |      no |           configurable |               yes |
| Change appearance settings         |      no |                     no |               yes |
| Manage media/resume                |      no |          upload/select |               yes |
| View contact bodies                |      no |          no by default |               yes |
| Restore revision                   |      no | own content if allowed |               yes |
| Manage users/security              |      no |                     no |               yes |
| View audit events                  |      no |                     no |               yes |
| Permanent delete                   |      no |                     no | yes + recent auth |

Every API action checks permission server-side. The admin UI hiding a control is not authorization.

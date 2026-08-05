# API specification

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
- A stale `If-Match` returns `409 CONFLICT` with the current version metadata and makes no write.
- `POST` operations that can be retried (upload completion, publish actions) accept an idempotency key with bounded retention.
- Rate-limit responses include `Retry-After`; detailed thresholds are configuration, not public guarantees.

## 4. Public endpoints

| Method | Path | Purpose | Cache |
| --- | --- | --- | --- |
| `GET` | `/public/site` | Enabled settings, navigation, sections, social links | short ISR/public cache |
| `GET` | `/public/projects` | Enabled projects and associated skills | public cache |
| `GET` | `/public/projects/:slug` | One public project | public cache |
| `GET` | `/public/blog/posts` | Published post summaries, cursor pagination | public cache |
| `GET` | `/public/blog/posts/:slug` | One published post and SEO data | public cache |
| `GET` | `/public/blog/categories/:slug` | Published posts in category | public cache |
| `GET` | `/public/blog/tags/:slug` | Published posts with tag | public cache/noindex policy may apply |
| `GET` | `/public/resume` | Active resume metadata/download location | short cache |
| `POST` | `/contact` | Validate, persist, and queue contact delivery | no-store, strict limit |

Draft, scheduled, archived, disabled, and soft-deleted records MUST behave as `404` on public endpoints.

RSS, sitemap, robots, and HTML routes are emitted by Next.js from these public read models; they are not alternate write paths.

## 5. Authentication endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/auth/csrf` | Issue/rotate a session-bound CSRF token |
| `POST` | `/auth/login/password` | Verify password and create a short-lived WebAuthn challenge flow |
| `POST` | `/auth/webauthn/options` | Return assertion options for an active login/re-auth flow |
| `POST` | `/auth/webauthn/verify` | Verify assertion and issue/rotate opaque session cookie |
| `POST` | `/auth/recovery/verify` | Consume recovery code under stricter limits and security notification |
| `GET` | `/auth/session` | Return minimal current actor/session state |
| `POST` | `/auth/reauthenticate` | Establish short recent-auth window for high-risk action |
| `POST` | `/auth/logout` | Revoke current session and clear cookies |
| `GET` | `/auth/sessions` | List current user’s session summaries |
| `DELETE` | `/auth/sessions/:id` | Revoke a session; recent auth required for another session |

Initial owner provisioning is a one-time deployment CLI/command with an expiring bootstrap secret, not an always-on public registration endpoint.

Cookies use the `__Host-` prefix in HTTPS production, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, and no `Domain`. Login responses are `Cache-Control: no-store`.

## 6. Admin resource endpoints

The following resource groups use conventional `GET` list/detail, `POST` create, `PATCH` update, and owner-restricted archive/delete operations under `/admin`:

- `/admin/settings`
- `/admin/sections`
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

Purpose-specific transitions are commands rather than arbitrary status patches:

| Method | Path | Rule |
| --- | --- | --- |
| `POST` | `/admin/blog/posts/:id/publish` | Validate publish checklist, create revision, set public time, invalidate routes |
| `POST` | `/admin/blog/posts/:id/schedule` | Owner/editor permission, future UTC timestamp |
| `POST` | `/admin/blog/posts/:id/unpublish` | Recent auth for owner policy, immediate cache invalidation |
| `POST` | `/admin/revisions/:id/restore` | Creates a new revision; never mutates history |
| `POST` | `/admin/resumes/:id/activate` | Atomic single-active update and cache invalidation |
| `POST` | `/admin/media` | Stream bounded upload through verification/quarantine |
| `POST` | `/admin/media/:id/archive` | Reject if still referenced unless replacement supplied |

Batch reorder endpoints accept the complete ordered ID set plus a collection version. They update in one transaction and reject duplicates/missing IDs.

## 7. Upload contract

- Accept only explicit media classes required by the product: PDF resume/certificates and approved raster image formats.
- Per-class byte and dimension limits are enforced before/while streaming.
- Extension and browser-supplied MIME are advisory; magic bytes and decoders determine accepted type.
- Filenames are display metadata only. Storage keys are random and cannot contain user paths.
- Images are decoded/re-encoded, metadata stripped, and variants created server-side.
- PDFs are served as non-executable content with safe disposition and isolated object origin where possible.
- Failed/unknown scans stay quarantined and cannot be attached or published.

## 8. Caching and invalidation contract

Public `GET` responses provide `Cache-Control`, `ETag`, and `Last-Modified` where meaningful. Admin/auth/contact responses are always `private, no-store`.

After a committed publish, unpublish, redirect, or active-resume transaction, the API sends a signed, replay-protected invalidation event to the web app. Invalidation failure is retried and observable; the database state remains authoritative.

## 9. Authorization matrix

| Action | Visitor | Editor | Owner |
| --- | ---: | ---: | ---: |
| Read published content | yes | yes | yes |
| Read/edit drafts | no | yes | yes |
| Publish/schedule content | no | configurable | yes |
| Manage media/resume | no | upload/select | yes |
| View contact bodies | no | no by default | yes |
| Restore revision | no | own content if allowed | yes |
| Manage users/security | no | no | yes |
| View audit events | no | no | yes |
| Permanent delete | no | no | yes + recent auth |

Every API action checks permission server-side. The admin UI hiding a control is not authorization.

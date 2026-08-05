# Data model specification

## 1. Database choice and connection

PostgreSQL is the source of truth. Prisma owns the schema and migrations in `packages/database`. The application receives one server-only connection string:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/portfolio?schema=public
```

Production SHOULD use TLS parameters required by its provider and a pool sized across all API replicas. Application and migration credentials SHOULD be separate: the runtime role receives only CRUD permissions on required objects; the migration role may alter schema.

Media binaries are not stored in PostgreSQL. The database stores object metadata and immutable storage keys; an S3-compatible store holds the bytes.

## 2. Global conventions

- Primary keys: UUID/CUID values, never guessable sequence numbers in public URLs.
- Time: `timestamptz` in UTC; `createdAt` and `updatedAt` on mutable records.
- Concurrency: mutable admin records carry integer `version`, incremented atomically.
- Deletion: content uses `archivedAt`/status where recovery matters. Hard deletion is exceptional.
- Slugs: normalized lowercase ASCII with hyphens, unique under the relevant content type.
- User input: normalized once, validated before persistence, encoded at output.
- Flexible section payloads may use `jsonb`, but each section key has a versioned Zod schema. Arbitrary unvalidated JSON is forbidden.
- URLs are stored as absolute `https` URLs except internal paths; unsafe schemes are rejected.

## 3. Identity and security models

### `User`

`id`, normalized unique `email`, `displayName`, `role` (`OWNER` or `EDITOR`), `passwordHash`, `status` (`ACTIVE`, `LOCKED`, `DISABLED`), `passwordChangedAt`, `lastLoginAt`, timestamps, version.

Password hashes contain Argon2id parameters and salt in the encoded hash. No plaintext or reversible password value exists.

### `WebAuthnCredential`

`id`, `userId`, unique `credentialId`, `publicKey`, `counter`, `transports`, `deviceType`, `backedUp`, `label`, `lastUsedAt`, timestamps.

Credential counters are updated transactionally after verified assertions. Private keys never enter the system.

### `Session`

`id`, `userId`, unique `tokenHash`, `csrfBindingHash`, `ipPrefixHash`, `userAgentSummary`, `createdAt`, `lastSeenAt`, `expiresAt`, `revokedAt`, `revokedReason`.

Only a SHA-256/HMAC-derived token hash is stored. The random token exists solely in the secure cookie. Absolute and inactivity expirations both apply.

### `RecoveryCode`

`id`, `userId`, unique `codeHash`, `createdAt`, `usedAt`. Codes are high entropy, single-use, hashed, rate-limited, and regenerated as a set.

## 4. Portfolio content models

### `SiteSettings`

Singleton record containing public site name/URL, locale, timezone, default title template, default meta description, default social image ID, contact availability, robots policy flags, and version.

### `PageSection`

`id`, unique stable `key` (`hero`, `about`, `skills`, etc.), `title`, validated `content` JSON, `schemaVersion`, `enabled`, `sortOrder`, version, timestamps, archivedAt.

Section keys are an allowlist in code. The API rejects content that does not match that key’s contract.

### `SocialLink`

`id`, `label`, `url`, `iconKey`, `rel`, `enabled`, `sortOrder`, version, timestamps.

### `Project`

`id`, unique `slug`, `title`, `summary`, optional long description, `status` (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `ARCHIVED`), `demoUrl`, `repositoryUrl`, `imageId`, `featured`, `sortOrder`, `startedAt`, `completedAt`, version, timestamps, archivedAt.

### `SkillCategory` and `Skill`

Categories have `id`, unique name, sort order, enabled state, and version. Skills have `id`, category ID, unique normalized name, color, optional icon/media reference, sort order, enabled state, and version. `ProjectSkill(projectId, skillId, sortOrder)` is the many-to-many join with a composite unique key.

### `Certificate`

`id`, title, description, issuer, instructor and URLs, score text, issued date, credential URL, certificate media ID, enabled, sort order, version, timestamps, archivedAt.

### `Quote`

`id`, text, author, source URL, enabled, sort order, version, timestamps. Selection is deterministic per UTC day or explicitly pinned so server and client HTML do not disagree.

### `MediaAsset`

`id`, immutable random `storageKey`, original safe display name, media kind, verified MIME type, byte size, checksum, image width/height when relevant, alt text, processing state, visibility, uploader ID, timestamps, archivedAt.

The object key is internal. Public URLs are constructed by an adapter or returned as short-lived signed URLs as appropriate.

### `ResumeVersion`

`id`, `mediaAssetId`, label, optional public filename, uploadedBy, `activatedAt`, `retiredAt`, timestamps. A partial unique constraint/transaction guarantees at most one active resume.

## 5. Blog models

### `Post`

`id`, unique current `slug`, title, excerpt, `bodyMarkdown`, optional rendered-content checksum/cache, status, author ID, category ID, cover media ID, SEO title, SEO description, canonical URL, social image ID, `publishedAt`, `scheduledFor`, `readingMinutes`, version, timestamps, archivedAt.

Rules:

- `DRAFT`: not publicly readable.
- `SCHEDULED`: has a future `scheduledFor`; not public until transitioned.
- `PUBLISHED`: has `publishedAt`; appears in feeds/sitemaps unless explicitly excluded.
- `ARCHIVED`: absent from discovery; prior URL behavior is an explicit redirect or `410`, never an accidental draft leak.
- Only reviewed Markdown is stored. Rendered HTML is derived with an allowlisted sanitizer policy.

### `Category`, `Tag`, and `PostTag`

Categories and tags have unique slug/name, optional description, enabled state, and timestamps. Each post has zero or one category and many tags through `PostTag(postId, tagId)` with a composite unique key.

### `SlugRedirect`

`id`, unique `fromPath`, `toPath`, status code restricted to `301` or `308`, source entity ID/type, createdBy, createdAt. Redirect chains and loops are rejected; changes collapse to the final target.

## 6. Governance and operational models

### `ContentRevision`

`id`, `entityType`, `entityId`, `entityVersion`, action, actor ID, complete redacted `before`/`after` JSON snapshots, createdAt. A unique `(entityType, entityId, entityVersion)` constraint prevents duplicate history. Authentication secrets and session tokens are never snapshotted.

### `AuditEvent`

Append-only security/administrative record: `id`, actor ID when known, event type, target type/ID, outcome, request ID, coarse network/user-agent hashes, redacted metadata, createdAt. Application roles cannot update audit rows.

### `ContactMessage`

`id`, name, normalized email, message, delivery status, provider message reference, abuse score/reason, createdAt, deliveredAt, deletionDueAt. Contact bodies are sensitive and follow a short configured retention period.

## 7. Principal relationships

```mermaid
erDiagram
  USER ||--o{ SESSION : owns
  USER ||--o{ WEBAUTHN_CREDENTIAL : registers
  USER ||--o{ POST : authors
  USER ||--o{ CONTENT_REVISION : creates
  PROJECT }o--o{ SKILL : uses
  SKILL_CATEGORY ||--o{ SKILL : groups
  POST }o--o{ TAG : tagged
  CATEGORY ||--o{ POST : categorizes
  MEDIA_ASSET ||--o{ POST : illustrates
  MEDIA_ASSET ||--o{ RESUME_VERSION : stores
  USER ||--o{ AUDIT_EVENT : performs
```

## 8. Index and constraint requirements

- Unique normalized user email and WebAuthn credential ID.
- Unique published/current post slug; unique tag/category/project slugs.
- Index `Post(status, publishedAt DESC)` and scheduled posts by `(status, scheduledFor)`.
- Index enabled/sort-order columns used for portfolio reads.
- Index session token hash and expiration/revocation fields.
- Index audit/revision by target and descending creation time.
- Check positive media size, sensible sort order, valid publish-state timestamps, and non-empty trimmed titles.
- Foreign-key delete policies are explicit: restrict referenced media and taxonomy; cascade only private joins/sessions where safe.

## 9. Backup and retention

- Daily encrypted database backups plus provider point-in-time recovery where available.
- Object storage versioning or equivalent retention for resume/blog assets.
- Contact messages are automatically purged after the configured window.
- Expired/revoked sessions and used recovery codes are purged on a schedule after the audit window.
- Revisions and audit events have documented retention and protected access.
- A restore is not considered valid until database records and referenced objects pass reconciliation.

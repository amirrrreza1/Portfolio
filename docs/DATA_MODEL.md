# Data model specification

## 1. Database choice and connection

PostgreSQL is the sole source of truth for portfolio content, complete Markdown article bodies, localized metadata, publication state, revision history, identity, media metadata, and operational state under [ADR-015](DECISIONS.md#adr-015--postgresql-native-article-authoring-and-publication). MinIO stores binary media only.

Prisma owns the schema and migrations in `packages/database`. The application receives one server-only connection string:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/portfolio?schema=public
```

Production SHOULD use TLS parameters required by its provider and a pool sized across all API replicas. Application and migration credentials SHOULD be separate: the runtime role receives only CRUD permissions on required objects; the migration role may alter schema.

Media binaries are not stored in PostgreSQL. The database stores object metadata and immutable storage keys; MinIO holds the bytes through its S3-compatible API.

## 2. Global conventions

- Primary keys: UUID/CUID values, never guessable sequence numbers in public URLs.
- Time: `timestamptz` in UTC; `createdAt` and `updatedAt` on mutable records.
- Concurrency: mutable admin records carry integer `version`, incremented atomically.
- Deletion: content uses `archivedAt`/status where recovery matters. Hard deletion is exceptional.
- Slugs: English uses normalized lowercase ASCII with hyphens. Persian uses normalized Persian Unicode plus ASCII hyphens, stored as NFC and percent-encoded in URLs. Uniqueness is locale-scoped after normalization; see ADR-010.
- User input: normalized once, validated before persistence, encoded at output.
- Flexible section payloads may use `jsonb`, but each section key has a versioned Zod schema. Arbitrary unvalidated JSON is forbidden.
- URLs are stored as absolute `https` URLs except internal paths; unsafe schemes are rejected.
- **Translatable fields** are stored per locale, never as a single concatenated value. Locale codes come from the closed allowlist in [I18N.md](I18N.md) §1.
- **Rendered HTML is a cache, never an input.** Any column holding rendered HTML records the source identity (SHA-256 body digest or record version) plus a `rendererVersion`, and is discarded rather than trusted when either changes.
- Colour values are validated `#rrggbb` strings, and are checked for contrast against every enabled theme before they can be saved.

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

### Translation strategy for portfolio content

Portfolio content is translatable with **English required and Persian optional**, falling back to English when absent — the opposite of articles, and deliberately so, per [I18N.md](I18N.md) §4. A page with one untranslated label is broken in a way that a missing article is not.

Two patterns are used, chosen per entity:

- **Sidecar translation table** for entities with several translatable fields (`PageSection`, `Project`, `Certificate`, `Category`, `Tag`), named `<Entity>Translation` with `(entityId, locale)` unique.
- **Per-locale jsonb map** for entities with one or two short translatable strings (`SocialLink.label`, `NavItem.label`, `Quote.text`), validated by a Zod schema keyed on the locale allowlist.

Every translatable field records whether a locale value is present, so the admin panel can flag untranslated fields rather than hiding the gap behind a fallback.

### `SiteSettings`

Singleton record containing public site name, canonical site URL (the `metadataBase` value, resolved from `PUBLIC_SITE_URL` until M7 moves it here), default locale, enabled locales, timezone, default title template, default meta description, default social image ID, author/creator/publisher name, optional search-console verification tokens, contact recipient address, contact availability flag, contact retention days, GitHub username, GitHub repository allowlist, GitHub cache TTL, robots policy flags, and version.

Translatable fields (site name, title template, meta description) use the sidecar pattern. The contact recipient address is server-only and MUST NOT appear in any public DTO.

### `AppearanceSettings`

Singleton record containing `enabledThemes` (ordered keys), `defaultTheme`, `enabledBlogFonts` (ordered keys), `defaultBlogFontByLocale`, `allowedBlogSizeSteps`, `defaultBlogSizeStep`, `offerMotionToggle`, version, timestamps.

Every key MUST exist in the code registry described in [THEMING.md](THEMING.md) §3–§4; the default MUST be within the enabled set; at least one theme and one script-compatible font per enabled locale MUST remain enabled. **No stored value here is ever interpolated into CSS** — these are keys that select static, authored token sets and `@font-face` declarations.

### `PageSection`

`id`, unique stable `key` (`hero`, `about`, `skills`, etc.), validated `content` JSON, `schemaVersion`, `enabled`, `sortOrder`, version, timestamps, archivedAt, plus `PageSectionTranslation(sectionId, locale, title, content)` for the translatable payload.

Section keys are an allowlist in code. The API rejects content that does not match that key's contract. Prose inside a section uses the restricted inline-Markdown profile in [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) §10, and its sanitized render is cached with the record version.

### `NavItem`

`id`, `labelByLocale`, `targetKind` ∈ `{SECTION_ANCHOR, INTERNAL_ROUTE}`, `target`, `iconKey`, `enabled`, `sortOrder`, version, timestamps.

`iconKey` is validated against a code registry of permitted icons; an arbitrary string is rejected. `target` is a section key or a site-relative path — never an external URL, so the header cannot be turned into an off-site redirect surface. Nav items MUST render server-side.

### `SocialLink`

`id`, `labelByLocale`, `url`, `iconKey`, `rel`, `kind` ∈ `{SOCIAL, EMAIL, DONATE}`, `enabled`, `sortOrder`, version, timestamps.

`mailto:` is permitted only for `kind = EMAIL`; every other kind requires absolute `https`.

### `Project`

`id`, unique `slug`, `status` (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `ARCHIVED`), `demoUrl`, `repositoryUrl`, `featured`, `sortOrder`, `enabled`, `startedAt`, `completedAt`, `legacyId`, version, timestamps, archivedAt, plus `ProjectTranslation(projectId, locale, title, summary, longDescription)`.

`demoUrl` and `repositoryUrl` distinguish null from empty: absent means the link is not rendered. A placeholder `"#"` is not a URL and is rejected. `legacyId` preserves the numeric ID from `Projects.json` for migration reconciliation and is never exposed publicly.

### `SkillCategory` and `Skill`

Categories have `id`, stable `key`, sort order, enabled state, `legacyId`, version, and `SkillCategoryTranslation(categoryId, locale, name)`.

Skills have `id`, category ID, unique normalized `name`, `color`, sort order, enabled state, `legacyId`, and version. Skill names are proper nouns and are **not** translated. `color` is validated `#rrggbb` and contrast-checked against every enabled theme by `checkBadgeColorContrast` in `@portfolio/contracts/appearance`, because label text colour is derived from it at render time. Two checks, not one: the badge fill against each theme's page background, and the derived label against the fill.

`ProjectSkill(projectId, skillId, sortOrder)` is the many-to-many join with a composite unique key. Moving a skill between categories preserves its project links.

### `Certificate`

`id`, issuer name and URL, instructor name and URL, `scoreText`, `issuedAt`, `credentialUrl`, certificate media ID, enabled, sort order, `legacyId`, version, timestamps, archivedAt, plus `CertificateTranslation(certificateId, locale, title, description)`.

`scoreText` is free text such as `98/100`. It is **not** a number and MUST NOT be emitted as a structured-data rating. `issuedAt` is a real date; the legacy `YYYY/MM/DD` strings are normalized on migration. The media reference is resolved case-sensitively, which is what catches the two case-mismatched certificate paths documented in [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md) §6.

### `Quote`

`id`, `textByLocale`, author, source URL, enabled, `pinned`, sort order, version, timestamps.

Selection is deterministic — the pinned quote, otherwise a stable function of the UTC date — and computed server-side, so the cached HTML is valid and server and client cannot disagree. `"Anonymous"` is a legitimate author value and MUST NOT be normalized away.

### `MediaAsset`

`id`, immutable random `storageKey`, original safe display name, media kind, verified MIME type, byte size, checksum, image width/height when relevant, alt text, processing state, visibility, uploader ID, timestamps, archivedAt.

The object key is internal. Public URLs are constructed by an adapter or returned as short-lived signed URLs as appropriate.

### `ResumeVersion`

`id`, `mediaAssetId`, label, optional public filename, uploadedBy, `activatedAt`, `retiredAt`, timestamps. A partial unique constraint/transaction guarantees at most one active resume.

## 5. Blog models

Article bodies are stored in PostgreSQL. `PostTranslation.bodyMarkdown` is the
authoritative normalized source; rendered HTML is a provenance-checked cache.
Optional `.md`/`.mdx` import is an ingestion path only and never creates a
second file-backed authority.

### `Post`

`id`, author ID, category ID, cover media ID, `featured`, `pinnedUntil`, version, timestamps, archivedAt.

`Post` carries only what is shared across languages: identity, authorship, taxonomy, and the cover image. It has **no** title, slug, body, or publication date — those are per translation. The `id` is the immutable directory name in the content repository, so a slug change never moves a file.

### `PostTranslation`

`id`, `postId`, `locale`, `title`, `slug`, `excerpt`, `seoTitle`, `seoDescription`, `canonicalUrl`, `socialImageId`, `status`, `publishedAt`, `scheduledFor`, `readingMinutes`, `headingTree` (jsonb), `bodyMarkdown`, `bodySha256`, `renderedHtml`, `rendererVersion`, `frontmatterSchemaVersion`, version, timestamps, archivedAt.

Rules:

- `(postId, locale)` is unique. `locale` is constrained to the allowlist.
- `(locale, slug)` is unique. Slugs are unique per locale, not globally, so English and Persian may coincidentally share a slug.
- Slug normalization follows [ADR-010](DECISIONS.md#adr-010--unicode-persian-slugs-are-canonical). An optional ASCII transliteration is a redirect alias, never a second canonical value.
- Status is **per translation**: `DRAFT` is not publicly readable; `SCHEDULED` has a future `scheduledFor` and no `publishedAt`; `PUBLISHED` has `publishedAt` and appears in that locale's feeds and sitemap; `ARCHIVED` is absent from discovery, with prior URLs resolving to an explicit redirect or `410` and never leaking a draft.
- A `Post` MUST have at least one `PostTranslation`. A `Post` whose every translation is non-public is itself non-public.
- **No fallback.** A locale without a `PUBLISHED` translation is not served in that locale, per [ADR-005](DECISIONS.md#adr-005--bilingual-articles-as-per-locale-translations-of-one-post).
- `bodyMarkdown` is the authoritative normalized Markdown source, `bodySha256` is its normalized UTF-8 SHA-256 digest, and `version` is the optimistic-concurrency token.
- `renderedHtml` is a cache produced by the pipeline in [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) §8, valid only while `bodySha256` matches the authoritative Markdown and `rendererVersion` is current. It is never written from a request payload.
- Incomplete source metadata, invalid source hashes, or stale renderer versions exclude a translation from public discovery and surface an owner-visible integrity warning.
- A check constraint enforces the status/timestamp invariants, so a `PUBLISHED` row without `publishedAt` cannot exist.

### `PostDraft`

`id`, `postId`, `locale`, `authorId`, `bodyMarkdown`, `frontmatter` (jsonb), `baseVersion`, `updatedAt`.

Editor autosave only. Unique on `(postId, locale, authorId)`. These rows are working state, never a publication source, and are deleted once their content is saved. `baseVersion` records the integer translation revision the author started from. Draft bodies are excluded from revision snapshots.

### `ArticleImportReport`

`id`, unique `tokenHash`, actor ID, unique original quarantined media ID,
optional requested/resolved post ID, locale, optional base version, acceptance
flag, line-addressed findings (jsonb), accepted normalized frontmatter (jsonb)
and body, exact diff, expiry, optional committed timestamp, and created time.

The random confirmation token is returned once and only its SHA-256 is stored.
Every report is actor-, target-, locale-, version-, expiry-, and one-time-use
bound. Rejected reports cannot retain normalized frontmatter or body. The
referenced `MediaAsset` is a private `DOCUMENT` in `QUARANTINED` state holding
the exact uploaded bytes under a random internal object key; it has no public
delivery path. Confirmation sends accepted normalized content through the same
transactional save and revision path as the editor.

### `Category`, `Tag`, `CategoryTranslation`, `TagTranslation`, and `PostTag`

Categories and tags have a stable `key`, enabled state, sort order, and timestamps. Human-readable name, slug, and description are per locale in `CategoryTranslation(categoryId, locale, name, slug, description)` and `TagTranslation(tagId, locale, name, slug, description)`, each unique on `(locale, slug)`.

Taxonomy is shared across a post's translations: a post has zero or one category and many tags through `PostTag(postId, tagId)` with a composite unique key. Article saves/imports never create taxonomy implicitly; unknown category or tag references are rejected transactionally.

### `SlugRedirect`

`id`, `locale`, unique `(locale, fromPath)`, `toPath`, status code restricted to `301` or `308`, source entity ID/type, createdBy, createdAt. Redirect chains and loops are rejected; changes collapse to the final target. A slug change in one locale creates a redirect only within that locale.

### Publication jobs and invalidation outbox

PostgreSQL-backed publication jobs track due scheduled translations with bounded leases, retries, and dead-letter visibility. The transactional cache-invalidation outbox records signed-delivery work without storing article bodies or introducing a second source of truth.

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
  POST ||--|{ POST_TRANSLATION : "has per locale"
  POST_TRANSLATION ||--o{ SLUG_REDIRECT : "leaves behind"
  POST ||--o{ POST_DRAFT : "autosaves"
  PROJECT ||--|{ PROJECT_TRANSLATION : "has per locale"
  PROJECT }o--o{ SKILL : uses
  SKILL_CATEGORY ||--o{ SKILL : groups
  POST }o--o{ TAG : tagged
  CATEGORY ||--o{ POST : categorizes
  MEDIA_ASSET ||--o{ POST : illustrates
  MEDIA_ASSET ||--o{ RESUME_VERSION : stores
  MEDIA_ASSET ||--o{ CERTIFICATE : evidences
  USER ||--o{ AUDIT_EVENT : performs
```

## 8. Index and constraint requirements

- Unique normalized user email and WebAuthn credential ID.
- Unique `(postId, locale)` and `(locale, slug)` on `PostTranslation`; unique `(locale, slug)` on category and tag translations; unique project slug.
- Unique `(locale, fromPath)` on `SlugRedirect`.
- Index `PostTranslation(locale, status, publishedAt DESC)` for listings and feeds, and `(status, scheduledFor)` for the scheduler.
- Index scheduled publication status/time for the publication scheduler.
- Index `PostTranslation(bodySha256)` for source-integrity diagnostics where needed.
- Index enabled/sort-order columns used for portfolio reads, and `(entityId, locale)` on every translation table.
- Index session token hash and expiration/revocation fields.
- Index audit/revision by target and descending creation time.
- Check positive media size, sensible sort order, non-empty trimmed titles, `#rrggbb` colour format, and locale values within the allowlist.
- Check publish-state invariants per translation: `PUBLISHED` requires `publishedAt`; `SCHEDULED` requires `scheduledFor` and forbids `publishedAt`.
- Partial unique index guaranteeing at most one active `ResumeVersion`.
- Foreign-key delete policies are explicit: restrict referenced media and taxonomy; cascade translations with their parent; cascade only private joins, drafts, and sessions where safe. `PostTranslation` cascades from `Post`; `Post` deletion is blocked while any translation is `PUBLISHED`.

## 9. Backup and retention

- Daily encrypted database backups plus provider point-in-time recovery where available.
- **Article bodies, metadata, drafts, and revision history are fully contained in encrypted PostgreSQL backups.** A valid restore additionally verifies every referenced MinIO object, article source SHA-256, and published render; no repository clone is required. See [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) §12.
- `renderedHtml` is a cache and need not be backed up; it is regenerable from the authoritative PostgreSQL Markdown source. It MUST NOT be the only surviving copy of any article.
- `PostDraft` rows are working state with a short retention window and are excluded from revision snapshots.
- MinIO versioning or equivalent retention for resume/blog assets.
- Contact messages are automatically purged after the configured window.
- Expired/revoked sessions and used recovery codes are purged on a schedule after the audit window.
- Revisions and audit events have documented retention and protected access.
- A restore is not considered valid until database records and referenced objects pass reconciliation.

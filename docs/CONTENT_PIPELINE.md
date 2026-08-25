# Content pipeline specification

Article text, publication state, rendered output, and revision history have one authority: PostgreSQL. MinIO stores binary media. Markdown files are an optional import/export format, never another authoritative content store.

Normative decisions: [ADR-004](DECISIONS.md#adr-004--markdown-with-an-allowlisted-directive-set-no-runtime-mdx-execution) and [ADR-015](DECISIONS.md#adr-015--postgresql-native-article-authoring-and-publication).

## 1. Storage responsibilities

| Concern                                                           | Authority  |
| ----------------------------------------------------------------- | ---------- |
| Article body, locale, editorial metadata, and publication state   | PostgreSQL |
| Sanitized HTML, heading tree, reading time, and source digest     | PostgreSQL |
| Drafts, optimistic versions, revision snapshots, and audit events | PostgreSQL |
| Publication schedules and cache-invalidation outbox               | PostgreSQL |
| Images, documents, and other binary media                         | MinIO      |

The API never reads article bodies from the Git repository, a mounted content directory, or MinIO. Public responses expose reviewed rendered output, not authoring Markdown or internal integrity metadata.

## 2. Article identity and integrity

A `Post` owns immutable identity and shared taxonomy. Each `PostTranslation` owns one `en` or `fa` article, including its `bodyMarkdown`, `bodySha256`, rendered HTML, renderer version, locale-specific metadata, publication state, timestamps, and monotonically increasing `version`.

The source digest is the SHA-256 of the normalized UTF-8 Markdown body. A public translation is discoverable only when it is published, not archived, has a valid source body and digest, and its complete render cache was produced by the current renderer. Missing or inconsistent integrity data fails closed.

Markdown export may use `content/blog/<postId>/<locale>.md` as a portable filename convention. Exported files are snapshots and are never watched, synchronized, or treated as production authority.

## 3. Editorial metadata and frontmatter

The shared strict frontmatter schema remains the import/export envelope and editor metadata contract:

```yaml
schemaVersion: 1
postId: clx8k2p9q0000abcd1234efgh
locale: en
title: Rendering Markdown without shipping a Markdown renderer
slug: rendering-markdown-server-side
status: draft
publishedAt: null
scheduledFor: null
updatedAt: 2026-08-06T11:20:00Z
excerpt: A short original summary for listings and metadata.
category: engineering
tags: [nextjs, markdown, security]
coverImage: null
coverImageAlt: null
seoTitle: null
seoDescription: null
canonicalUrl: null
socialImage: null
translationOf: null
```

- Unknown fields, unsupported schema versions, empty titles/excerpts, invalid locale-specific slugs, and unsafe canonical URLs are rejected.
- Published translations require `publishedAt`; scheduled translations require a future `scheduledFor` and cannot already have `publishedAt`.
- Categories, tags, cover images, and social images must reference existing approved records. An informative cover requires nonempty alternative text.
- The Markdown body must be nonempty, contain no level-one heading, and pass the complete production renderer and sanitizer.
- Imported YAML is bounded and safely parsed; unknown tags, unbounded aliases, and arbitrary object construction are forbidden.

## 4. Admin authoring

Admin mutation endpoints are introduced only after the M6 authentication, authorization, session, and CSRF boundaries are complete. Before then, the article repository and renderer may be tested directly but must not be exposed as unauthenticated routes.

1. The editor loads the current translation, including its integer optimistic-concurrency `version`.
2. Typing autosaves an author-scoped `PostDraft` carrying the base version. Autosave never changes published output.
3. Authenticated previews use the production renderer and are short-lived, unguessable, `noindex`, and `no-store`.
4. Explicit save validates metadata, references, and body; normalizes the body; computes SHA-256; and renders sanitized HTML.
5. One PostgreSQL transaction checks the expected version, writes the translation and render cache, increments the version, records a content revision and audit event, and enqueues affected cache tags in the durable invalidation outbox.
6. A stale expected version returns `409 CONTENT_CONFLICT` with the current version and does not modify article state.

The editor remains a plain Markdown surface with preview, a directive palette, and a prepublication checklist. User-authored HTML is never round-tripped through a WYSIWYG editor.

## 5. Markdown import and export

Import is a deliberate **parse and report, then confirm and save** operation:

1. Accept one bounded `.md`, `.markdown`, or `.mdx` upload decoded as strict UTF-8.
2. Reject unsafe HTML, unknown metadata, unsafe URL protocols, executable MDX constructs, and unmapped JSX components with useful diagnostics.
3. Present validated or explicitly labeled inferred metadata for review; never silently invent required values.
4. Resolve referenced images through the normal approved MinIO media pipeline.
5. On confirmation, save the normalized Markdown through the same transactional PostgreSQL article path as the editor.

Accepted MDX is converted to safe Markdown/directives before storage. Export serializes current PostgreSQL metadata and Markdown deterministically. Import/export does not require Git credentials, a webhook, a content branch, or a deployment.

## 6. Versions, revisions, and conflict handling

`PostTranslation.version` is the only article write concurrency token. `PostDraft.baseVersion` records the revision an editor started from. Every committed content change creates an immutable `ContentRevision` snapshot containing enough information to inspect and restore the article.

Concurrent writes with the same expected version cannot both succeed. A failed render, reference check, transaction, or optimistic-concurrency check leaves the previous public article and revision history unchanged. Revision restore is a new validated save, not an in-place rewrite of history.

## 7. Scheduled publication

A scheduled translation stores its intended publication time directly in PostgreSQL. A dedicated lightweight scheduler, protected by a PostgreSQL advisory lock, enqueues due publication work; HTTP API replicas run no scheduler timers.

The publication worker transactionally confirms that the translation remains due and valid, sets `status = PUBLISHED` and `publishedAt`, increments its version, records a revision/audit event, and enqueues cache invalidation. The article is live after transaction commit, without a Git commit, webhook, reconciliation pass, or deployment.

Jobs and invalidation delivery are idempotent, bounded, and retryable. Unpublishing invalidates affected article, listing, feed, and sitemap tags immediately because stale withdrawn content is a disclosure risk.

## 8. Render pipeline

Rendering happens once, server-side, when an article is saved. The sanitized result is cached in PostgreSQL with its source SHA-256 and renderer version. No Markdown parser, sanitizer, or syntax highlighter is shipped to the browser.

Fixed order, no step optional:

1. Parse Markdown with GFM and bounded footnotes.
2. Parse directives, validating every directive name and attribute against the allowlist in §9.
3. Produce deterministic heading anchors, a table of contents, reading-time estimates, and safe internal links.
4. Convert Markdown to HTML with raw HTML disabled.
5. Highlight code server-side using Shiki, fixed light/dark themes, and bounded language support; unknown languages fall back to plain text.
6. Apply the explicit HTML sanitizer, including safe protocols, bounded attributes/classes, and reviewed external-link handling.
7. Serialize sanitized HTML. Sanitization remains the last content-changing transform.

One reviewed rendering boundary inserts cached article HTML. That boundary and reviewed JSON-LD serialization are the only permitted `dangerouslySetInnerHTML` uses and are covered by XSS tests.

Cached output is valid only for the recorded SHA-256 and current `rendererVersion`. Renderer upgrades require rerendering before an article can be publicly served.

## 9. Directive allowlist

| Directive   | Form      | Attributes                                      | Accessibility and safety                                  |
| ----------- | --------- | ----------------------------------------------- | --------------------------------------------------------- |
| `::callout` | container | `type`, optional `title`                        | Labeled region; meaning is never conveyed by color alone. |
| `::figure`  | container | approved media `src`, `alt`, optional `caption` | Semantic figure/caption and known dimensions.             |
| `::video`   | leaf      | allowlisted `provider`, `id`, `title`           | User-initiated, sandboxed embed; no autoplay.             |
| `::details` | container | `summary`                                       | Native keyboard-accessible disclosure.                    |
| `::steps`   | container | optional `start`                                | Semantic ordered procedure list.                          |

Attributes are validated rather than interpolated. Unknown directives, scripts, inline styles, event handlers, and unsandboxed frames are rejected before persistence.

## 10. Portfolio prose fields

Short portfolio text also remains PostgreSQL-authoritative under [ADR-007](DECISIONS.md#adr-007--portfolio-content-is-database-backed-and-fully-admin-editable). It uses a tighter inline-Markdown profile supporting emphasis, inline code, and safe links but rejecting blocks, images, and article directives.

## 11. Feeds, sitemaps, and derived surfaces

Feeds, sitemaps, archives, and localized article listings read published, integrity-valid PostgreSQL translations only. Missing translations never fall back to another locale. Drafts, scheduled translations, archived translations, stale renderers, and incomplete source metadata are never discoverable.

## 12. Backup and recovery

Encrypted PostgreSQL backups contain complete article bodies, metadata, versions, revisions, drafts, publication schedules, taxonomy, and audit history. MinIO backups contain referenced binary media.

A successful restore proves that every published translation has a valid Markdown source, matching SHA-256, current sanitized render, resolvable media references, and correct bilingual publication behavior. No content-repository clone or Git reconciliation is needed.

## 13. Required verification

- Metadata validation, bounded safe YAML import, locale-aware canonical slugs, and approved taxonomy/media references.
- Markdown/MDX import rejection for executable JSX, unsafe HTML/protocols, invalid UTF-8, and missing media.
- Optimistic version conflict, rollback after render/transaction failure, immutable revision creation, and safe revision restore.
- Atomic scheduled publication under concurrent scheduler replicas and idempotent repeated job delivery.
- Render integrity, source SHA-256, renderer-version fail-closed behavior, bilingual no-fallback reads, and XSS/directive regression cases.
- Transactional cache-outbox creation, bounded signed delivery/retries, and withdrawal invalidation.
- PostgreSQL-and-MinIO backup restoration with complete article/media integrity checks.

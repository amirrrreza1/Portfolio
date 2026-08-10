# Content pipeline specification

How article text gets in, where it lives, how it is rendered, and how the file store and the database stay honest with each other.

Normative decisions: [ADR-003](DECISIONS.md#adr-003--git-repository-is-the-source-of-truth-for-article-bodies) and [ADR-004](DECISIONS.md#adr-004--markdown-with-an-allowlisted-directive-set-no-runtime-mdx-execution).

## 1. Roles of the two stores

| Concern                                            | Authority            |
| -------------------------------------------------- | -------------------- |
| Article body text                                  | Git repository       |
| Frontmatter as authored intent                     | Git repository       |
| Post identity, slug history, taxonomy              | PostgreSQL           |
| Realized publication state and timestamps          | PostgreSQL           |
| Sanitized render cache, reading time, heading tree | PostgreSQL           |
| Blob SHA and sync state per translation            | PostgreSQL           |
| Media binaries                                     | MinIO object storage |

The rule that resolves every ambiguity: **Git is authoritative for what the text says; PostgreSQL is authoritative for what the site is currently doing with it.**

The API MUST NOT serve a body whose render cache does not match the recorded blob SHA. On mismatch it re-renders from Git before responding, or fails closed if Git is unreachable and no valid cache exists.

## 2. Repository layout

Content lives in the same repository as the application, in a directory that no build step imports:

```text
content/
├─ blog/
│  └─ <postId>/
│     ├─ en.md
│     ├─ fa.md
│     └─ assets/          # optional per-post images, mirrored to MinIO
└─ .content-schema         # integer schema version of the frontmatter contract
```

Rules:

- The directory name is the immutable `Post.id` (a CUID), never the slug. Slugs change; identity does not. This means a slug change is a database and redirect operation with no file move.
- Locale filenames come from a fixed allowlist (`en`, `fa`). Any other filename is a sync error, not a new locale.
- Paths are constructed server-side from validated identifiers only. No user-supplied string ever contributes a path segment. Any resolved path outside `content/` is a hard rejection with an audit event.
- `content/` is excluded from the Next.js build trace and from Docker runtime images. The application reads content through the Git API and the database index, never from the local working tree in production.
- Content commits land on the protected dedicated `content` branch and are not merged into the application deployment branch during normal publishing. Repository rules disallow force-push/deletion and the Git App cannot modify workflows; see [ADR-011](DECISIONS.md#adr-011--article-bodies-use-a-protected-dedicated-content-branch).

## 3. Frontmatter contract

YAML frontmatter, parsed in **safe mode** — no custom tags, no anchors/aliases expansion beyond a bounded budget, no arbitrary object construction. Parsed with a Zod schema in `packages/contracts` that rejects unknown keys.

```markdown
---
schemaVersion: 1
postId: clx8k2p9q0000abcd1234efgh
locale: en
title: Rendering Markdown without shipping a Markdown renderer
slug: rendering-markdown-server-side
status: published # draft | scheduled | published | archived
publishedAt: 2026-08-04T09:00:00Z
scheduledFor: null
updatedAt: 2026-08-06T11:20:00Z
excerpt: A short original summary used for listings, meta description, and RSS.
category: engineering
tags: [nextjs, markdown, security]
coverImage: media_01hq2v8x9y
coverImageAlt: A terminal showing a build log
seoTitle: null
seoDescription: null
canonicalUrl: null
socialImage: null
translationOf: null
---

Body starts at an H2. The H1 is generated from `title`.
```

Validation rules:

- `schemaVersion` MUST match a supported version. An unsupported version blocks sync rather than guessing.
- `postId` MUST match the containing directory. `locale` MUST match the filename. A mismatch is a sync error.
- `title` and `excerpt` are required, trimmed, length-bounded, and MUST NOT be empty after normalization.
- `slug` follows [ADR-010](DECISIONS.md#adr-010--unicode-persian-slugs-are-canonical): English is lowercase ASCII; Persian is normalized Persian Unicode stored as NFC and percent-encoded in URLs. A reviewed Latin transliteration may exist as a redirect alias, never as a competing canonical form.
- `status: published` requires `publishedAt`; `status: scheduled` requires a future `scheduledFor` and forbids `publishedAt`.
- `category` and every `tag` MUST already exist as taxonomy records. Sync does not silently create taxonomy; it reports the missing slug.
- `coverImage` and `socialImage` MUST reference existing `MediaAsset` IDs. An informative cover image requires non-empty `coverImageAlt`.
- `canonicalUrl`, when present, MUST be an absolute `https` URL and triggers an off-site warning in the editor.
- The body MUST NOT be empty, MUST NOT contain a level-one heading, and MUST parse cleanly.

Frontmatter is authored intent. The database mirror is the realized state; §7 covers the one case where they can legitimately differ.

## 4. Authoring in the admin panel

1. The editor loads the post; the response carries the current blob SHA per translation as the concurrency token.
2. Typing autosaves to a **local draft** — a database `PostDraft` row keyed by post, locale, and author. Autosave never commits to Git.
3. Preview renders through the exact production pipeline of §8 on an authenticated, short-lived, unguessable, `noindex`, `no-store` URL.
4. On explicit save the API:
   - validates the whole document against the frontmatter schema and the directive allowlist;
   - serializes frontmatter deterministically (stable key order, LF endings, UTF-8, no BOM, single trailing newline) so a no-op save produces no diff;
   - creates or reuses a durable operation intent keyed by the request idempotency key;
   - commits to Git with `If-Match` on the known blob SHA and the operation ID in fixed metadata;
   - on success, atomically applies the index row, render cache, revision, audit event, operation state, and invalidation outbox;
   - on a SHA mismatch, returns `409 CONFLICT` with a diff and writes nothing.
5. Rapid successive saves are coalesced by a short debounce and a per-post queue so the Git host is not hammered.

If Git succeeds but the apply transaction fails, the durable operation plus commit metadata allow webhook/reconciliation processing to re-read the blob by SHA and apply it idempotently. The same `(repository, commitSha, path)` never creates two revisions. Cache invalidation is delivered from the outbox with bounded retries; see [ADR-012](DECISIONS.md#adr-012--durable-operation-log-idempotent-recovery-and-invalidation-outbox-for-git-writes).

The editor is a plain Markdown textarea with a live preview, a directive insert palette, and a pre-publish checklist. It is not a WYSIWYG surface that round-trips HTML, because HTML round-tripping is how sanitized pipelines get bypassed.

## 5. Importing an uploaded `.md` or `.mdx` file

Upload is a two-step, never-blind operation: **parse and report, then confirm and commit.**

1. Accept a single file, size-bounded, extension in `{.md, .mdx, .markdown}`, decoded strictly as UTF-8. Invalid byte sequences are rejected, not replaced.
2. Reject or strip, with a line-referenced report:
   - raw HTML blocks and inline HTML tags;
   - MDX `import`/`export` statements, JSX expression containers, and any component without a directive mapping;
   - unsafe link and image protocols;
   - frontmatter keys outside the schema.
3. Parse frontmatter. Missing fields are presented as a form pre-filled with what could be inferred (title from the first heading, excerpt from the first paragraph, reading time computed). Nothing is invented — an inferred value is labeled as inferred.
4. Rewrite relative image references: each referenced local file must be resolvable from an accompanying upload or an existing `MediaAsset`, otherwise the import is reported as incomplete. Images are ingested through the normal media pipeline in [API_SPEC.md](API_SPEC.md) §7.
5. The owner reviews the normalized result and the exact diff that will be committed, then confirms. Only then is a commit made.
6. `.mdx` input is always normalized to a `.md` file. The original upload is retained in quarantine for the audit window so an import can be re-examined, and is never served.

A file that fails validation is never partially imported. Import is transactional in the same sense as any other write.

## 6. Sync from Git and conflict handling

Direct pushes to `content/` are a supported authoring path, so sync is bidirectional in effect even though writes are one-directional.

- The Git host calls a signed webhook. The signature is verified with a constant-time comparison over the raw body, with a timestamp window and nonce replay store, exactly as specified for cache invalidation in [SECURITY.md](SECURITY.md) §6.
- The webhook payload is a trigger, not data. The worker re-reads the affected paths from the Git API by commit SHA and validates them from scratch.
- A dedicated worker consumes PostgreSQL-backed webhook and reconciliation jobs. A reconciliation job also runs on a schedule and on demand, comparing the recorded blob SHA of every translation against the branch head, so a missed webhook self-heals.
- Validation failures do not change published output. The index row is flagged `SYNC_FAILED` with the reason, the previous good render stays live, and the owner is notified. Broken content in the repository can never take the site down or publish itself.
- Conflict resolution: the blob SHA is the only concurrency token. Admin writes always use `If-Match`. A push that lands between load and save produces a `409` with a diff; the owner chooses to reload, or to overwrite with an explicit force that is separately audited. There is no automatic merge of article bodies.
- Sync never deletes. A file removed from Git marks the translation `MISSING_IN_GIT` and unpublishes it after owner confirmation, so an accidental force-push cannot silently erase published articles.

## 7. Scheduled publishing across two stores

A scheduled post is an intent recorded in a file and a transition realized in a database. Reconciling them is the one genuinely awkward consequence of ADR-003, and it is handled explicitly.

1. Saving with `status: scheduled` and a future `scheduledFor` commits that intent and sets the same values in the index.
2. The dedicated scheduler process holds a PostgreSQL advisory lock before enqueueing due translations. HTTP API replicas have no timers; see [ADR-013](DECISIONS.md#adr-013--postgresql-backed-jobs-with-dedicated-sync-and-scheduler-workers).
3. At the due time the worker transactionally sets `status = PUBLISHED` and `publishedAt`, writes a revision and audit event, and invalidates routes. **The article is live at this instant, with no commit and no deploy.**
4. The worker then enqueues a **bot reconciliation commit** that rewrites only `status` and `publishedAt` in the frontmatter, with a fixed message (`chore(content): publish <postId>/<locale>`) and a bot identity. This commit is idempotent and retried with backoff.
5. If the reconciliation commit cannot land, the translation is flagged `FRONTMATTER_DRIFT`. The site is correct, the file is stale, and the drift is visible in the admin dashboard until resolved. Publication is never blocked on a Git write.
6. Drift detection runs in the reconciliation job: for every translation, realized state is compared to authored intent and any difference other than a pending bot commit is reported.

Unpublishing follows the same shape and additionally invalidates immediately, since leaving a withdrawn article cached is a disclosure issue rather than a staleness issue.

## 8. Render pipeline

Rendering happens **once, server-side, at write or sync time**, and the sanitized result is cached in the database with the source blob SHA. The web app renders cached HTML into server components. No Markdown parser, sanitizer, or syntax highlighter is shipped to the browser.

Fixed order, no step optional:

1. `remark-parse` with GFM (tables, strikethrough, task lists, autolinks). Footnotes enabled.
2. `remark-directive`, then a custom transform that validates each directive against the allowlist in §9 and rejects unknown names and attributes.
3. Bounded-cost transforms: heading slugs (deterministic, unique, stable across renders), autolinked heading anchors, table-of-contents extraction, reading-time estimate, internal-link resolution.
4. `remark-rehype` with `allowDangerousHtml: false`.
5. Shiki highlighting server-side, with a fixed theme pair and a bounded language allowlist. An unknown language renders as plain text with a visible label, never as an error.
6. `rehype-sanitize` with an explicit schema: allowlisted tags, attributes, and class names; `href`/`src` restricted to `https`, site-relative, and `mailto`; `javascript:` and `data:` rejected except a narrowly specified safe-image case; every external link gets `rel="noopener noreferrer nofollow ugc"` where appropriate and target rules applied.
7. Serialize to HTML. Sanitization is the **last** transform, so nothing after it can reintroduce unsafe output.

The cached HTML is inserted through exactly one reviewed boundary in the codebase. That boundary and the JSON-LD serializer are the only permitted uses of `dangerouslySetInnerHTML`, and both are covered by tests against an XSS corpus.

Cache invalidation for the render cache is keyed on the blob SHA plus a `rendererVersion` constant. Bumping the renderer version re-renders everything on next access, which is how a sanitizer or highlighter upgrade rolls out safely.

## 9. Directive allowlist

Each directive has a name, a Zod attribute schema, a reviewed React component, an accessibility contract, and sanitizer allowances. Adding one is a code change with a test, by design.

| Directive   | Form      | Attributes                                              | Notes                                                                                       |
| ----------- | --------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `::callout` | container | `type` ∈ {note, tip, warning, danger}, optional `title` | Renders a labeled region; type conveyed by text and icon, never colour alone                |
| `::figure`  | container | `src` (MediaAsset ID), `alt`, optional `caption`        | `figure`/`figcaption`; known dimensions to prevent layout shift                             |
| `::video`   | leaf      | `provider` ∈ {youtube, vimeo}, `id`, `title`            | Facade image that loads the iframe on interaction; sandboxed, no autoplay, host allowlisted |
| `::details` | container | `summary`                                               | Native `details`/`summary`, keyboard accessible                                             |
| `::steps`   | container | optional `start`                                        | Ordered procedure list with correct list semantics                                          |

Rules:

- Attribute values are validated, not interpolated. An ID must resolve to an existing record; a free-text attribute is escaped.
- No directive may emit a script, a style attribute, an event handler, or an unsandboxed iframe.
- An unknown directive is a validation error at write time, so it can never reach a reader as broken markup.

## 10. Portfolio prose fields

Short portfolio text (About Me paragraphs, hero lines, project summaries, section intros) is stored in PostgreSQL, not in files, per [ADR-007](DECISIONS.md#adr-007--portfolio-content-is-database-backed-and-fully-admin-editable). These fields use a **restricted inline Markdown** profile: emphasis, strong, inline code, and links only. Block elements, images, and directives are rejected. They pass through the same sanitizer with a tighter schema and are cached alongside the record.

This is what replaces the `<B>` and `<I>` helper components currently embedded in `AboutMe.tsx`, and what lets the owner edit that prose without touching source.

## 11. Feeds, sitemaps, and derived surfaces

RSS, sitemap, robots, and archive pages are generated from the database index and render cache — never by reading the repository at request time. They are per-locale, and they include only translations whose realized state is `PUBLISHED`. A translation in `SYNC_FAILED`, `MISSING_IN_GIT`, or drift state is excluded from newly generated feeds and reported to the owner.

## 12. Backup and recovery

Content has two independent recovery paths, which is a deliberate benefit of this design:

- **Git**: a clone of the content branch is a complete, human-readable copy of every article body and its full history.
- **PostgreSQL**: encrypted backups carry the index, taxonomy, revisions, and audit history.

Recovery drills MUST verify that a database restore plus a repository clone reproduce the site, and that reconciliation reports zero unexplained differences: every index row has a matching file at the recorded SHA, every content file has an index row, every referenced media asset exists, and every published translation renders.

## 13. Tests specific to this pipeline

- Frontmatter schema: required fields, unknown keys, bad dates, non-existent taxonomy and media references, `postId`/`locale` mismatch, unsupported `schemaVersion`.
- Path safety: traversal attempts, absolute paths, symlinks, non-allowlisted locale filenames, and unicode normalization tricks in any identifier.
- YAML safety: oversized documents, deep nesting, alias expansion, and unsafe tags.
- Import: `.mdx` with imports/exports/JSX, raw HTML, unsafe protocols, mixed encodings, invalid UTF-8, missing images, no frontmatter.
- Determinism: save → no-op save produces an empty diff; round-tripping frontmatter is byte-stable.
- Concurrency: stale `If-Match` returns `409` and writes nothing; concurrent push and save do not lose text.
- Scheduling: due transition publishes without a commit; failed reconciliation commit leaves the site correct and raises drift; the scheduler does not double-publish under two replicas.
- Sync resilience: missed webhook self-heals; invalid file in Git does not change live output; deleted file does not silently unpublish.
- Render: XSS corpus, unsafe-link corpus, unknown directive, unknown code language, heading ID stability and uniqueness, renderer-version cache busting.
- Recovery: reconciliation detects an index row without a file, a file without a row, and a SHA mismatch.

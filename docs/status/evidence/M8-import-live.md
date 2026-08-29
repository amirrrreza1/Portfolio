# M8 — deterministic Markdown import, live

Run date: **2026-08-29**  
Result: **30/30 live API checks and 1/1 real-browser test passing**

This is M8's third slice: a two-step Markdown ingestion boundary that never
lets an upload become authoritative merely because it parsed. The first call
retains the exact source, reports what would be saved, and returns a short-lived
capability only for accepted input. The second call consumes that capability
and invokes the same validated PostgreSQL article-save path as the editor.

## What shipped

- `prepareArticleImport` in `@portfolio/markdown`: bounded strict UTF-8 decode,
  newline normalization, safe frontmatter inference, executable-MDX rejection,
  production rendering, deterministic `.md` serialization, and a compact exact
  diff against the current translation.
- `quarantineArticleSource` in `@portfolio/media`: byte-for-byte retention at a
  random private object key, with SHA-256 and length captured before parsing can
  fail.
- `ArticleImportReport` in PostgreSQL: the durable actor/target/locale/version
  review record. Only the token digest is stored; accepted normalized content
  is protected by a database check constraint and confirmation is single use.
- Multipart dry run and JSON confirmation at `POST /api/v1/admin/blog/import`,
  both `no-store`, CSRF-protected, and permission-checked.
- An import panel in `AdminBlogEditor` showing findings, inferred metadata, the
  normalized Markdown, exact save diff, quarantine reference, expiry, and a
  deliberate confirmation dialog.

## Boundary under test

```text
bounded upload
    -> exact private quarantine object + MediaAsset
    -> strict decode / normalize / validate / production render
    -> persisted ArticleImportReport + one-time raw token
    -> explicit actor confirmation
    -> normal transactional article save + immutable revision
```

The report token is not a bearer shortcut around authorization. Confirmation
must have the same actor, post target, locale, and current base version as the
dry run; the report must be accepted, unexpired, and unused. A new translation
is forced to `DRAFT`. An existing translation retains its lifecycle state and
publication timestamps, so import cannot substitute for publish, schedule,
withdraw, or archive commands.

## Live API proof

`pnpm --filter @portfolio/api verify:blog` drove the compiled API over real
HTTP against PostgreSQL and MinIO. The existing 25 authoring checks remained
green and five import groups extended the result to 30/30:

| #   | Import check                                                                                  | Result |
| --- | --------------------------------------------------------------------------------------------- | ------ |
| 26  | An MDX expression is rejected with its source line and no confirmable report                  | pass   |
| 27  | The rejected source still exists byte-for-byte as private quarantined media                   | pass   |
| 28  | Plain `.mdx` with missing frontmatter reports inference, normalized `.md`, and the exact diff | pass   |
| 29  | Token confirmation persists through the normal renderer/revision transaction                  | pass   |
| 30  | Reusing the consumed report token is refused with `409 CONFLICT`                              | pass   |

The persisted translation's body digest and renderer provenance were read back
after confirmation rather than inferred from the response.

## Real-browser proof

The existing serial owner flow in `blog-editor.spec.mts` now continues into the
import panel after save, publication, and preview:

1. Upload executable MDX and see `MDX_EXPRESSION · line 5` with no confirmation
   control.
2. Upload plain Markdown in an `.mdx` file without frontmatter and see the
   `INFERRED_TITLE` finding, normalized document, exact diff, and private source
   retention reference.
3. Accept the confirmation dialog, consume the report token, and see the new
   article in the workspace.

The proof used the real recovery-code flow, API, PostgreSQL, MinIO, and Chrome.
Another local workspace already owned `localhost:3000` and `:4000`, so this run
used the same alternate topology as the earlier editor evidence: web `:3003`
and API `:4006`. A local SMTP sink on `127.0.0.1:2526` received the mandatory
recovery notification; without a listening sink, successful recovery correctly
waits for the configured SMTP transport before returning.

## Focused regression coverage

- Markdown import: safe normalization, missing-frontmatter inference, strict
  UTF-8, raw HTML/unsafe syntax refusal, code-fence-aware MDX scanning, and
  deterministic diff output.
- Media: exact bytes, digest, size, random quarantine key, private visibility,
  and bounded source size.
- API/service: token hashing, actor binding, one-time use, lifecycle
  preservation, and confirmation through article persistence.
- Contracts/database: report response shape and the accepted/rejected storage
  invariant.

## Re-running

With PostgreSQL, MinIO, SMTP, API, and web running from the repository:

```text
pnpm --filter @portfolio/api verify:blog
pnpm --filter @portfolio/api provision:cms-browser
pnpm --filter @portfolio/web test:e2e:admin -- blog-editor
```

The browser variables are the same as
[`M8-editor-live.md`](M8-editor-live.md). Provision a fresh recovery code before
every browser run because successful use consumes it.

## Still open in M8

Article revision restore, the discovery/SEO surfaces, and the
single-scheduler/retry/transactional-rollback publication matrix remain open.

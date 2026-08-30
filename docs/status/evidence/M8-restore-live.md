# M8 — article revision restore, live

Run date: **2026-08-30**  
Result: **41/41 live API checks and 1/1 real-browser test passing**

This is M8's fourth slice: getting an earlier version of an article back. M7
built the restore endpoint and proved it for every portfolio family; an article
could not use it, because an article is not a row of fields. Its stored form
includes a sanitized render and a source digest that only the Markdown pipeline
may produce, so replaying a snapshot field by field would have resurrected
output from whatever renderer was current that day and turned the digest from a
check into a claim.

## What shipped

- `restoreArticleRevision` in `@portfolio/database`: reads one revision, refuses
  a snapshot that no longer matches its own digest, and replays the recorded
  **source** through `saveTranslation` — the same transaction an author's save
  runs. The render, the digest, the reading time and the heading tree are all
  produced now, by today's renderer.
- `ArticleSaveOrigin`, so a restore is that one save path with different
  evidence: a `RESTORE` revision and an `article.translation.restored` audit
  event naming the revision it came from, rather than a second write path that
  has to stay identical to the first forever.
- `POST /admin/revisions/:id/restore` — still the single restore endpoint from
  API_SPEC §6 — routes an article revision to that path before its generic
  transaction opens, so Markdown rendering never happens between `BEGIN` and
  `COMMIT`.
- `GET /admin/blog/posts/:id/translations/:locale/revisions` and
  `…/revisions/:revisionId`: history scoped to one translation, and one
  revision rendered as the document a restore would write plus its exact diff
  against the article as it stands. The list omits the stored `renderedHtml`,
  which is the largest column in the row and useless to a history list.
- A **Version history** panel in `AdminBlogEditor`: compare, then restore,
  beside the article being edited.
- The revision snapshot now records the SEO fields, the canonical URL and the
  social image. Without them a restore silently kept today's metadata beside
  yesterday's prose. `revisionSnapshot` also stopped existing twice — the
  transition module and the article store each had a copy, and this addition is
  exactly the kind that gets made to one of them.

## Two rules the restore does not break

**Lifecycle comes from today, never from the snapshot.** A revision records the
status the row had when it was written; replaying that would let "restore the
text I had on Tuesday" publish a withdrawn article or withdraw a live one.
Publication is a command with a checklist, an audit event and a cache
consequence, not a side effect of editing prose. Import made the same choice for
the same reason.

**Post-level taxonomy comes from today too.** Category, tags and cover image
belong to the post that both locales share, so a per-locale restore that rewrote
them would reach across the language boundary.

An archived translation refuses the restore outright: `archivedAt` is written
from the frontmatter status, so replaying a snapshot onto an archived row would
stamp today's date on a withdrawal that happened weeks ago. Reading that
article's history stays allowed — the refusal belongs to the write.

## Live API proof

`pnpm --filter @portfolio/api verify:blog` drove the compiled API over real HTTP
against PostgreSQL 16.13 and an S3-compatible object store. The 30 authoring and
import checks stayed green and 11 restore checks extended the result to 41/41.

| #   | Restore check                                                                    | Result |
| --- | -------------------------------------------------------------------------------- | ------ |
| 31  | A second save gives the imported article a history to restore from               | pass   |
| 32  | History is scoped to one translation and omits the stored render                 | pass   |
| 33  | A revision previews as the document a restore would write, with its diff         | pass   |
| 34  | A revision cannot be read through another article's path                         | pass   |
| 35  | Restoring replays the recorded source through the validated save path            | pass   |
| 36  | The restored article is re-rendered and re-digested rather than copied           | pass   |
| 37  | The slug the restore moved away from keeps resolving                             | pass   |
| 38  | The restore is recorded as a new revision and never rewrites history             | pass   |
| 39  | A restore cannot publish or withdraw: lifecycle stays where the commands left it | pass   |
| 40  | An archived translation refuses a restore instead of re-dating its withdrawal    | pass   |
| 41  | A snapshot edited outside the write path is refused, and writes nothing          | pass   |

Check 41 is destructive on purpose: the run edits `after.bodyMarkdown` of a
stored revision directly in PostgreSQL, then asserts the restore is refused and
the translation's version and body are untouched.

## The defect the live run found

**Moving a slug back produced a redirect to itself, and failed the whole
transaction with a `500`.**

`recordSlugMove` collapses redirect chains: anything pointing at the old path is
rewritten to point at the new one, so no visitor makes two hops. Restoring is
the first operation that routinely moves an article _back_ to a path it already
redirects away from, and in that case the collapse rewrote the existing
`/a → /b` rule into `/a → /a`. PostgreSQL refused it —
`slug_redirects_no_self_target` — inside the restore's transaction, so the
restore answered `500` and wrote nothing.

The loop case was already handled: the destination's own rule is deleted so the
move cannot create a cycle. It simply ran _after_ the collapse. Clearing the
destination first removes that row before anything can point it at itself, and
the collapse now also excludes any rule whose source is the destination. Both
guards are kept; the order is the fix.

This was reachable before this slice — an author who renamed a slug and renamed
it back would have hit it — and no test found it, because a unit test with a
fake Prisma client has no check constraint to violate. The regression test that
now pins it asserts the _order_ of the two statements, which is the part a fake
can still observe.

## Real-browser proof

`blog-editor.spec.mts` continues past import into version history, on the
article it published earlier in the same flow:

1. Reopen the published article and save a regretted title over it.
2. See the newest revision at the top of **Version history**, find the earlier
   one, and compare it — the diff shown is the server's answer about what a
   restore would write.
3. Accept the confirmation dialog, restore, and see the title return.
4. The article is still published: the withdraw command remains available,
   which a restore must not have performed on the author's behalf.

The proof used the real recovery-code flow, the real API, PostgreSQL, and
Chrome.

## Focused regression coverage

`packages/database/test/article-restore.spec.ts` — replay through the validated
save path, re-render rather than snapshot copy, lifecycle preservation, the
redirect written when a slug moves back, the statement order that fixes the
self-target defect, digest-mismatch refusal, archived refusal, and refusal of a
revision that does not describe an article.

## Re-running

With PostgreSQL, object storage, SMTP, the API, and the web app running from the
repository:

```text
pnpm --filter @portfolio/api verify:blog
pnpm --filter @portfolio/api provision:cms-browser
pnpm --filter @portfolio/web test:e2e:admin -- blog-editor
```

Provision a fresh recovery code before every browser run; successful use
consumes it.

## Still open in M8

The discovery and SEO surfaces, and the single-scheduler/retry-idempotency/
transactional-rollback publication matrix.

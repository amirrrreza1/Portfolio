# M8 — the blog authoring boundary, proven against a running stack

Run date: **2026-08-28**  
Result: **25 checks, all passing**  
Command: `pnpm --filter @portfolio/api verify:blog`

The first M8 slice: post and taxonomy CRUD, per-locale editorial state
transitions, autosave, the publish checklist, slug history and redirects — all
behind the M6 authentication boundary, all proven against real PostgreSQL
rather than a mock.

## What existed before this slice

M3 built the article authority: `saveTranslation`, source/render integrity,
immutable revisions, the invalidation outbox, and the scheduled-publication
worker. M4 proved the public read paths. What had never existed was a way for a
person to reach any of it. `packages/contracts/src/blog/commands.ts` had
described every command since M3 — and nothing implemented `publish`,
`schedule`, `unpublish`, or `archive`, no endpoint addressed a translation, and
`PUBLISH_BLOCKERS` was a list of eleven constants that nothing computed.

## The stack under test

| Component  | Version / setting                                                               |
| ---------- | ------------------------------------------------------------------------------- |
| PostgreSQL | 16.13 — note the gap from the 17 target; no 17 is available in this environment |
| API        | `apps/api` on `http://127.0.0.1:4006`, real Prisma, real S3 client              |
| Storage    | an S3-compatible endpoint on `:9000`                                            |
| Content    | `db:seed` then `migrate:legacy`, as for the M7 run                              |

## The checks

### 1. The authoring boundary (4 checks)

Anonymous authoring reads are refused. A real recovery-code flow establishes the
owner session. A cookie mutation without the CSRF token is refused. Every
authoring read answers `private, no-store` **and** `Vary: Cookie`.

That last pair is checked together on purpose: a shared cache that honours one
and ignores the other can still serve one admin's page to another session.

### 2. Taxonomy is created explicitly, never implied (3 checks)

A category and a tag can be created and translated. The article store refuses an
unknown category or tag in frontmatter rather than creating one — otherwise a
typo silently becomes a category that appears in public navigation — so these
endpoints are the only way taxonomy comes into being.

A taxonomy translation is versioned against its **parent row**, not against
itself, and saving a second locale from a stale screen is refused with `409`.
The two locales of one category share an enable flag and a sort order and are
edited from one screen, so the row is the unit of concurrency. Article
translations are the opposite case — genuinely independent per locale — and are
versioned individually.

### 3. Save, autosave, and optimistic concurrency (5 checks)

An explicit save renders through the production pipeline and persists source,
digest, and version together. A body whose frontmatter names a different post or
locale than the URL is refused: the path is the addressing authority, and
accepting the body's opinion would let one URL write anywhere.

A stale save returns `409` **and the row's version is re-read to confirm nothing
was written** — a conflict that still wrote would satisfy a status-code
assertion and fail the requirement.

Autosave writes `PostDraft` and provably does not touch the committed row. The
editor read then reports the draft _beside_ the saved body, flagged as ahead of
it, rather than merging the two: "your unsaved work was silently applied" is the
one outcome an autosave must never produce.

### 4. The publish checklist gates the transition (4 checks)

The checklist raises no blockers for a complete article. Publishing with
unacknowledged warnings is refused, the row stays `DRAFT`, and the refusal names
the warnings — an opaque "cannot publish" would send the author back to a screen
that already told them everything was fine. Acknowledging every warning
publishes.

Blockers and warnings are computed by a pure evaluator in
`@portfolio/contracts` from facts the caller gathers, so the same checklist can
describe a draft that has never been saved. Three of the blockers —
`EMPTY_BODY`, `BODY_HAS_H1`, `UNSAFE_LINK` — describe bodies the renderer
_throws_ on, which is why `inspectArticleSource` was added to
`@portfolio/markdown`: it parses with the same configuration and reports instead
of refusing.

### 5. Withdrawal, slug moves, and archiving (5 checks)

The published article is readable on the public detail path, and stops being
readable the moment it is withdrawn — checked through the public API, not by
reading the row back.

A slug change leaves a `308` from the old path. A **second** move collapses the
chain rather than adding a hop: both old paths end up pointing at the current
one. A visitor never pays for two redirects, and search engines stop following
after a few.

Archiving is versioned and explicit and can leave a redirect. Archiving without
one leaves the path to answer `410`, which is the honest response for something
withdrawn on purpose.

### 6. Evidence written by the same transactions (4 checks)

Every transition left an immutable revision, a distinct audit event
(`published`, `unpublished`, `archived`), and a durable invalidation outbox row
— all inside the transaction that changed the state. A transition that committed
without its invalidation would leave a withdrawn article cached, which
SECURITY.md treats as a disclosure rather than a staleness bug.

The last check is the one worth keeping: an operator's reason for withdrawing an
article appears in the **audit event** and provably not in the content revision.
A reason is operator context — "withdrawn pending legal review" — and copying it
into the revision would put it on the restore path, where it would eventually be
shown as though it were part of the article.

## The defect this run found

**`archive` enqueued an invalidation with a reason the signed-event contract
does not have, and every archive failed with a `500` inside its transaction.**

`invalidationEventSchema` allows `publish`, `unpublish`, `redirect`,
`resume-activate`, and `save`. The lifecycle module declared its own
`InvalidationReason` union by hand and included `"archive"`. TypeScript was
satisfied — the local type was internally consistent — and nothing caught it
until Zod parsed a real payload at the end of a real archive.

Two things were wrong and both are fixed. The type is now
`InvalidationEvent["reason"]`, derived from the contract rather than copied
beside it. And archive enqueues `"unpublish"`, which is accurate: archiving has
no cache behaviour of its own, the URL simply has to stop being served, and the
editorial distinction is carried by the audit event next to it.

**The run also found that the failure was invisible.** The blog exception filter
answered `500` with an opaque body and logged nothing, so the first run reported
a failing check with no way to find out why. The filter now logs the stack for
any unmapped exception. An opaque body is right for the client; an opaque server
is a defect nobody can diagnose without reproducing it by hand.

## Two changes outside the slice

**The admin request boundary is now shared.** M7 implemented authentication,
CSRF, origin, `Sec-Fetch-Site`, `no-store` and `Vary` inside its controller. M8
adds a second admin controller, and two copies of a security check are two
things that can drift — the second copy is where `Vary: Cookie` quietly goes
missing. Both controllers now hold one `AdminRequestBoundary`. M7's own proof
was re-run against the refactor: 31/31, unchanged.

**The M5 prose gap is closed.** Article and project bodies rendered with no
typography at all — `h2` at 16px/400, lists with no markers, every block at
`margin: 0` — because `prose prose-invert` emitted nothing: the typography
plugin is a devDependency and Tailwind v4 only loads a plugin the stylesheet
asks for. Rather than register it, which would bring back `font-weight: 800`
faces the M5 trim deleted and colours THEMING §3 forbids, the reading surfaces
now carry explicit element rules built from tokens, at zero specificity via
`:where()`. The e2e fixture body — previously two paragraphs around a code
block — now contains a heading, a list, a blockquote, inline code, and a link,
so the appearance matrix can see article typography at all.

## Re-running this proof

```
pnpm --filter @portfolio/api verify:blog   # needs --apply, destructive
```

Needs `API_ORIGIN`, `WEB_ORIGIN`, `RECOVERY_SECRET`, and `DATABASE_URL`.

## What this slice does not do

The editor UI, `.md`/`.mdx` import, revision restore for articles, and every
discovery surface (sitemaps, RSS, JSON-LD, hreflang, category and tag pages,
related content) are the remaining M8 slices. `POST .../preview` renders through
the production pipeline and returns a short-lived in-process token; the preview
_route_ that serves it to a browser is part of the editor slice.

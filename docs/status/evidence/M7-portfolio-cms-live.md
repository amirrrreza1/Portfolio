# M7 — the portfolio CMS, proven against a running stack

Run date: **2026-08-28**  
Result: **31 API checks and 1 browser test, all passing**  
Commands:

- `pnpm --filter @portfolio/api verify:cms`
- `pnpm --filter @portfolio/web test:e2e:admin -- portfolio-cms`

This run closes the [M7](../M7.md) exit gate. The API surface and the admin
workspace were already written and unit-tested; what had never happened was
driving them against real PostgreSQL, real object storage, a real browser, and
— the part that mattered — **reading the public site afterwards**.

## The stack under test

| Component  | Version / setting                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| PostgreSQL | 16.13 — note the gap from the 17 target; no 17 is available in this environment                         |
| Migrations | all six applied with `psql --single-transaction`, in lexical order                                      |
| Content    | `db:seed` then `migrate:legacy` — 6 categories, 14 projects, 5 certificates, 35 quotes, 6 media objects |
| API        | `apps/api` on `http://127.0.0.1:4002`, real Prisma, real S3 client                                      |
| Storage    | an S3-compatible endpoint on `:9000`; the API's own `PutObject`/`GetObject` path                        |
| Web        | `next dev` on `http://localhost:3003`, `PORTFOLIO_DATA_SOURCE=database`                                 |
| Browser    | Chromium 1194 via Playwright                                                                            |
| Owner      | provisioned in the proof itself, signed in through a real recovery-code flow                            |

## What the API proof checks

### 1. Authenticated boundary and migrated inventory (7 checks)

Anonymous CMS reads are refused; a real recovery flow establishes the session;
every legacy row — all six skill categories, fourteen projects, five
certificates, thirty-five quotes — is reachable through `/admin` rather than by
editing JSON; and a cookie mutation without the CSRF token is refused.

### 2. Settings, authored text, and conflict safety (5 checks)

Settings expose a date-only birth date and the normalized `google`/`bing`
verification controls rather than the free-form JSON column. A write with a
stale `If-Match` version returns `409` **and does not persist** — the check
re-reads to confirm the losing edit changed nothing. SEO keywords, footer
lines, the resume button label, and all thirteen contact strings persist per
locale.

### 3. Content relationships and archive protections (5 checks)

A category, a skill inside it, and a project with an ordered skill relation all
commit together. A skill referenced by a project **cannot** be archived
(`400`). Archive and restore are explicit versioned operations, not a soft
delete that happens by accident.

### 4. Verified media and atomic resume activation (3 checks)

A PDF upload returns safe metadata with **no storage key in the response**. A
PDF carrying an `/OpenAction` is refused with `415` and quarantined, and the
response names the quarantined asset instead of discarding it. Activating a new
resume version retires the previous one in the same transaction — exactly one
active version remains.

### 5. Revision, audit, invalidation, and role evidence (6 checks)

Every mutated resource family produced an immutable revision — `SiteSettings`,
`SiteSettingsTranslation`, `PageSectionTranslation`, `SkillCategory`, `Skill`,
`Project`, `MediaAsset`, `ResumeVersion`. Thirteen success audit events and
twenty-four durable cache-invalidation rows were written by the same
transactions. `POST /admin/users` **refuses** to grant `EDITOR` — see the
second defect — and the grant table is proven instead against an editor row
seeded directly: it can read `/admin/projects` and is refused `/admin/settings`
with `403`. The audit and dashboard views answer `private, no-store`.

### 6. Public exposure of what the CMS just changed (5 checks)

This section is new, and it is why the run was worth doing.

The values written through `/admin` reach the public read: the keyword and the
Google verification token set during the proof appear in
`/public/en/site`, the contact submit label is the one just saved, and the raw
`searchConsoleTokens` blob still never appears. The resume activated in section
4 is served from the **stable** `/api/v1/public/resume/file` path — no storage
key in the URL — with `application/pdf`, `nosniff`, and an `attachment`
disposition, as [SECURITY.md](../../SECURITY.md) §8 requires.

## The defects this run found

### One unfinished record took the whole public site down

**One project authored in the CMS without an English translation returned `500`
for the entire locale, and the public site went to `503` behind it.**

`POST /admin/projects` creates the project record; translations are a separate
call. That intermediate state — a project row with no translations — is a
normal thing for an editor to produce and cannot be prevented without making
project creation a single giant request. But `PublicProjectsService.read`
called a `resolveTranslation` helper that **threw** inside the list `map`, so
one unfinished row failed the whole `/public/:locale/projects` response, and
the web app's locale layout turned that into a site-wide 503.

This is the same shape as the M4 articles defect, in a different resource
family: an integrity assertion that throws inside a collection read. The fix
follows the M4 precedent — `findTranslation` returns `null` instead of
throwing, collection reads log the exclusion and drop the record, and the
detail path returns `null`, which the controller answers as `404`.

`PublicHomeService` had the same fault twice over: a certificate without an
English translation, or without its verified PDF, threw and took the whole home
read with it. Both now exclude the record.

**Why nothing caught it earlier.** Every unit test builds its rows from the
same understanding as the code — a fixture author writing a project row writes
its translation too, because that is what a finished project looks like. The
API proof did not catch it either, until section 6 was added, because the proof
never read the public site after writing to the CMS. Four regression tests now
cover both services, and section 6 of the proof reads the public site with the
untranslated record still present.

### The role guard was never wired to the endpoint that grants roles

`isRoleAssignable()` was written in M6 to hold `EDITOR` back until the owner's
v1 editor-permission ADR lands. [DECISIONS.md](../../DECISIONS.md) states the
rule plainly — _"until accepted, provisioning remains owner-only and `EDITOR`
is not assignable"_ — and adds that a missed deadline "is not permission to
choose an adapter implicitly".

M7 added `POST /admin/users` and `PATCH /admin/users/:id`, and **neither
called the guard**. The function was exported and referenced by nothing but its
own unit test, so the role could be granted through the API while the module's
own comment two lines above the function still explained why it must not be.
The guard had also been changed to return `true` for `EDITOR`, and a unit test
named "allows the reviewed M7 editor role to be assigned" asserted that — but
no such review exists in `DECISIONS.md` or any ADR.

Both user endpoints now call the guard, the guard is owner-only again, and the
test asserts the refusal and cites the decision it comes from. The permission
matrix itself is unchanged: M6 wrote it conservatively for the day the ADR
lands, and that day has not come. **This is an owner decision, not a technical
one — the ADR is still owed.**

## What the browser proof checks

`apps/web/e2e/admin/portfolio-cms.spec.mts`, one serial test:

| #   | Check                                                                                      | Result |
| --- | ------------------------------------------------------------------------------------------ | ------ |
| 1   | A real recovery-code sign-in reaches the workspace as `OWNER`                              | pass   |
| 2   | Site and structure, portfolio collections, media and resume, history and access all load   | pass   |
| 3   | Two browser contexts edit the same settings; the second save wins                          | pass   |
| 4   | The **stale** context's save is refused in the UI with a conflict message, not overwritten | pass   |

Check 4 is the point: optimistic concurrency has to be visible to the person
editing, not only correct at the API. A `409` that the UI swallows is the same
failure as no version check at all.

The spec's first run failed on its own locator, not on the application: Next
renders a route announcer with `role="alert"`, so `getByRole("alert")` matched
two elements. The conflict message was on screen and correct. The locator is
now filtered by text.

## Re-running this proof

```
pnpm --filter @portfolio/api verify:cms          # needs --apply, destructive
pnpm --filter @portfolio/api provision:cms-browser
pnpm --filter @portfolio/web test:e2e:admin -- portfolio-cms
```

`verify:cms` needs `API_ORIGIN`, `WEB_ORIGIN`, `RECOVERY_SECRET`, and
`DATABASE_URL`. The browser run needs `E2E_ADMIN_BASE_URL` (which must equal
`WEBAUTHN_ORIGIN`, and must be a hostname — Chrome refuses an IP relying
party), `E2E_CMS_OWNER_EMAIL`, `E2E_CMS_OWNER_PASSWORD`, and
`E2E_CMS_OWNER_RECOVERY_CODE`. Recovery codes are single use, so
`provision:cms-browser` is re-run before each browser run.

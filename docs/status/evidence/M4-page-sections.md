# M2/M4 Hero, About, and page-section proof

Run date: **2026-08-14**  
Scope: hard-coded Hero/About migration, private age derivation, restricted inline Markdown, enabled-section ordering, database rendering, and isolated rollback  
Result: **Passed for this slice; M2 remains open only for the three reviewed colour choices, and M4 remains in progress**

## Preserved source and migration

The original Hero strings, both About paragraphs, and their `<B>`/`<I>`
emphasis were reviewed against the frozen pre-stabilization source at
`ca198d6^`. They now live in
`apps/web/src/DataBase/PageSections.json` as the source-preserving migration
input. The component files no longer own those literals.

Migration version `2026-08-14.page-sections.1`:

- validates the complete allowlisted render plan (`hero`, `about`, `skills`,
  `contact`, `projects`, `certificates`), unique keys, bounded order, exact Hero
  and About DTO shapes, real ISO date input, and the `{{age}}` token allowlist;
- writes the private birth date and the six section records in one PostgreSQL
  transaction after the separately versioned media/content migration;
- replaces the two deliberate M1 Hero/About placeholders with exact English
  inline Markdown and clears the invented Persian placeholders so the specified
  portfolio fallback is honest;
- records only `birthDateConfigured: true`, never the date, in the migration
  report; and
- is independently idempotent through its own checksum ledger.

The first run reported that the media migration was already applied and wrote
no media objects, then applied the page-section migration. The immediate replay
reported both migrations already applied and again wrote no objects or section
rows. The redacted deterministic report is
[`M2-page-sections-reconciliation.json`](M2-page-sections-reconciliation.json).

## PostgreSQL reconciliation

The applied database contained six enabled, non-archived rows in this order:

1. `hero`
2. `about`
3. `skills`
4. `contact`
5. `projects`
6. `certificates`

The English Hero row contained `Hello There!`, `I'm Amirreza Azarioun`, and
`A Developer / Student / Learner`, with the original `50`/`30`/`3000` timing
and Rubik-cube setting. The English About row contained both exact legacy
paragraphs as restricted inline Markdown. The Persian Hero/About translations
were empty rather than falsely translated. A database query proved a birth
date was configured without reading or recording its value.

## Public API and content safety

`GET /api/v1/public/en/site` and `/fa/site` returned HTTP `200`, matching
`Content-Language`, and the six-section order above. The API:

- derived the age in UTC from the private database date;
- substituted it into About prose before output;
- returned neither the date nor `{{age}}`;
- fell the intentionally untranslated Persian Hero/About fields back to the
  English portfolio values;
- preserved `ETag`; a matching conditional request returned `304` with a
  zero-byte body; and
- validates each Hero subtitle/About paragraph through the shared restricted
  Markdown renderer. A focused service test proves raw HTML is rejected.

## Database-backed rendered page

A fresh Next server ran with `PORTFOLIO_DATA_SOURCE=database` against the live
API and PostgreSQL. `/en` and `/fa` both returned HTTP `200`. Initial HTML
proved:

- all three exact Hero strings were server-visible;
- both About paragraphs and the derived age were present;
- original bold and italic meaning rendered as `<strong>` and `<em>`;
- the six section IDs appeared in database order;
- animated section headings were server-visible rather than blank before
  hydration;
- neither the private date nor the raw template token appeared; and
- the Persian route used the documented English portfolio fallback without an
  unavailable state.

The `contact` row was then temporarily disabled in the disposable database. A
fresh API response omitted it, and a unique fresh page request contained no
`id="getintouch"` while projects and certificates still rendered. The row was
restored to `enabled = true` immediately after the proof.

## Isolated legacy rollback

The web server was restarted with `PORTFOLIO_DATA_SOURCE=legacy` and
`API_INTERNAL_ORIGIN=http://127.0.0.1:1`. Both locales still returned HTTP
`200` with the same Hero/About text, derived age, `<strong>`/`<em>` semantics,
and section order. Legacy certificate/resume paths remained present, no API
document path appeared, and no unavailable state rendered. This proves the
rollback adapter owns the preserved source and does not call the configured
API.

## Automated verification

- 41 test files and **451 tests** passed across all nine workspaces with tests:
  contracts 290, auth core 7, content store 11, database 34, Markdown 8, media
  3, migration 14, API 31, and web 53.
- All nine workspace TypeScript checks passed.
- Declared API source lint and full web lint passed.
- Migration, database, API, and Next production builds passed.
- The root pnpm wrapper was not used as test evidence: its supply-chain metadata
  refresh timed out against the package registry before tests began. The same
  installed binaries were run directly for every workspace. This does not
  resolve M0's separate clean-checkout gate.

## Remaining limits

- Three migrated `#000000` skill colours still require owner-selected
  accessible replacements and a new reviewed normalization version before M2
  can close.
- Persian Hero/About translations have not been authored; English fallback is
  intentional and tested.
- Quote/resume placement remains attached to the Hero/certificate render slots;
  giving those two items independent page-section records is later CMS work if
  the owner wants them independently reorderable.
- Project detail/images, articles, catalogs, GitHub-stat caching, and HTTP `503`
  public outage responses remain open M4 work.

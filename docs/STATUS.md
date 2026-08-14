# Delivery status

Snapshot: **2026-08-14**

This is the human-readable entrypoint for delivery progress. [ROADMAP.md](ROADMAP.md) remains authoritative for milestone scope, dependencies, and exit gates. The files in [`status/`](status/) record what has been delivered, the evidence that exists, what is still missing, and the next actions for each milestone that has started.

## Current milestone state

| Milestone                                | Status          | Delivered so far                                                                                                                                                                                                                                              | Primary remaining gate                                                                                                                  | Detail             |
| ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| M0 — Baseline, guardrails, and decisions | **Blocked**     | Repository stabilization, CI, smoke tests, legacy manifest, risk cleanup, ADR-003–ADR-014                                                                                                                                                                     | Revoke/rotate the published EmailJS credentials at the provider; reconcile the legacy-screenshot and clean-build evidence discrepancies | [M0](status/M0.md) |
| M1 — Trusted domain and media foundation | **Complete**    | Contracts, real PostgreSQL migrations/constraints, deterministic seed, Markdown/media trust layers, package boundaries                                                                                                                                        | —                                                                                                                                       | [M1](status/M1.md) |
| M2 — Deterministic legacy migration      | **In progress** | Real PostgreSQL/MinIO apply/replay plus exact content/media, Hero/About, ordered sections, private age, and isolated rollback proof                                                                                                                           | Select accessible replacements for the three black skill colours and apply the reviewed normalization version                           | [M2](status/M2.md) |
| M3 — Git content-store proof             | **In progress** | GitHub App transport, safe paths/writes, webhook replay protection, tree reconciliation, apply ledger/outbox                                                                                                                                                  | Prove a protected real content branch, API worker, bilingual direct push, and forced partial-failure recovery                           | [M3](status/M3.md) |
| M4 — Public bilingual cutover            | **In progress** | Database-backed portfolio reads plus strict article contracts/API/clients, bilingual blog routes, no-fallback `404`, current-render provenance, 15-minute stale bounds, localized article `503`, published-only SEO, root negotiation, and bilingual catalogs | Prove a real M3-reconciled bilingual article and signed publication invalidation; complete discovery/social-image behavior              | [M4](status/M4.md) |
| M5 — Appearance and accessibility        | **In progress** | Database-backed owner allowlists, first-response preferences, settings dialog, CSP/pre-paint path, reduced-motion wiring, and controlled outage status                                                                                                        | Complete tokens/fonts and the full contrast, hydration, scoping, CSP, and no-JavaScript test matrix                                     | [M5](status/M5.md) |
| M6 — Authentication foundation           | **In progress** | Password/session/CSRF/recovery primitives, WebAuthn challenges, owner provisioning, Prisma adapters                                                                                                                                                           | API auth endpoints, complete WebAuthn verification, policies, audit/notifications, admin shell, recovery drill                          | [M6](status/M6.md) |
| M7 — Portfolio CMS                       | Not started     | —                                                                                                                                                                                                                                                             | M2–M6 gates                                                                                                                             | —                  |
| M8 — Blog authoring, publishing, and SEO | Not started     | —                                                                                                                                                                                                                                                             | M3, M4, M6, and M7 gates                                                                                                                | —                  |
| M9 — Operations, release, and cleanup    | Not started     | —                                                                                                                                                                                                                                                             | M5 and M8 gates                                                                                                                         | —                  |

## Delivery order

No new milestone should open until the current proof backlog contracts. The highest-leverage sequence is:

1. Resolve M2's three colour decisions and apply the reviewed normalization without changing the frozen source.
2. Prove M3 against the protected content branch and wire its worker into the API.
3. Connect M3's first real bilingual article to the implemented M4 article path and prove signed invalidation end to end.
4. Complete M5's specified verification matrix.
5. Finish the M6 API/admin boundary before any M7 mutation UI.

M0's EmailJS provider action can close independently and does not block this sequence.

## Evidence rules

- A merged implementation is recorded as delivered, not as a passed exit gate.
- A local unit suite does not prove a real PostgreSQL, MinIO, GitHub, browser, cache, or recovery drill.
- Environment-dependent gates stay open until their command output or run report is linked.
- Every milestone status file must be updated in the same change that changes its roadmap status.
- Status files describe the current snapshot; specifications remain the source of truth for required behavior.

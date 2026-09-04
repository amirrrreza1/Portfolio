# Milestone status files

This directory contains evidence-backed snapshots for every milestone that has started. Run reports live in [`evidence/`](evidence/README.md); each status file links the ones that back its gate.

| File           | Milestone                            | Current status | Snapshot   |
| -------------- | ------------------------------------ | -------------- | ---------- |
| [M0.md](M0.md) | Baseline, guardrails, and decisions  | Blocked        | 2026-08-14 |
| [M1.md](M1.md) | Trusted domain and media foundation  | Complete       | 2026-08-14 |
| [M2.md](M2.md) | Deterministic legacy migration       | Complete       | 2026-08-24 |
| [M3.md](M3.md) | PostgreSQL-native article foundation | Complete       | 2026-08-26 |
| [M4.md](M4.md) | Public bilingual cutover             | Complete       | 2026-08-26 |
| [M5.md](M5.md) | Appearance and accessibility         | Complete       | 2026-08-25 |
| [M6.md](M6.md) | Authentication foundation            | Complete       | 2026-08-27 |
| [M7.md](M7.md) | Portfolio CMS                        | Complete       | 2026-08-28 |
| [M8.md](M8.md) | Blog authoring, publishing, and SEO  | Complete       | 2026-09-04 |

M9 (operations, release, and cleanup) has not started and has no status file yet. Its gates depended on M5 and M8; both are now closed.

M0 is the only open milestone. Its repository-owned work is finished; the gate is held by one owner action at the EmailJS provider plus two evidence discrepancies, all recorded in [M0.md](M0.md).

The summary is [STATUS.md](../STATUS.md); milestone definitions and exit gates are in [ROADMAP.md](../ROADMAP.md).

# M3 live Git content-store run

Date: 2026-08-24  
Milestone: [M3](../M3.md) — Git content-store proof  
Environment: local PostgreSQL, repository-scoped GitHub App installation, and the real `content` branch of `amirrrreza1/Portfolio`.

## Successful configuration and content proof

- The configured private key issued a short-lived GitHub App installation token (`201`). No credential value was logged or recorded here.
- The App created `content` from `dev` and wrote two direct commits for the published proof post `cm3contentproof000000000`:
  - English slug: `git-content-store-verification`
  - Persian slug: `تایید-مخزن-محتوای-گیت`
- The scheduler enqueued a durable whole-tree reconciliation and the dedicated sync worker applied both translations. A replay reported `alreadyApplied: 2`, proving the apply ledger handles repeated reconciliation without duplicate application.
- Both final `post_translations` rows are `PUBLISHED`, `SYNCED`, and retain a source blob SHA and rendered HTML.

## Recovery and conflict proof

- A deliberately non-canonical Persian slug was rejected by the production parser, then corrected with an SHA-guarded write and reconciled successfully.
- A deliberately invalid English update marked the existing translation `SYNC_FAILED`; its last good render and source SHA remained present. Restoring the canonical source returned it to `SYNCED`.
- A temporary deletion of the Persian file marked that translation `MISSING_IN_GIT` while retaining its last good render and source SHA. Restoring the file returned it to `SYNCED`.
- A `PUT` with an intentionally stale blob SHA was rejected by GitHub with `409`; no write was made.

## Deliberate incomplete work

- The contents-only GitHub App cannot read the branch-protection endpoint (`403`). Repository-owner configuration must still prevent force-push/deletion and enable secret scanning/push protection for `content`.
- The local cache-invalidation receiver was not running, so the outbox correctly retained retryable pending entries after `404` responses. End-to-end delivery is M4's gate.
- A publicly reachable HTTPS webhook endpoint, Git-success/database-failure convergence, and Git-outage proof remain required before M3 can close.

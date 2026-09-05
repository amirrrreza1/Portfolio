# Incident response

1. **Triage:** identify the affected public/admin surface, start time, request IDs, deployment revision, and whether confidentiality, integrity, or availability is at risk. Do not copy message bodies, tokens, or credentials into tickets or chat.
2. **Contain:** disable contact intake or restrict admin at the edge when relevant; revoke sessions/credentials through the existing owner runbook; stop workers only when continued processing can worsen the event. Preserve durable failed jobs and outbox rows.
3. **Recover:** use the last compatible immutable images for application rollback. Use the isolated restore procedure when data integrity is uncertain. Never improvise a destructive reverse migration.
4. **Verify:** readiness, bilingual smoke, publication/invalidation queues, article render/source integrity, media checksums, owner access, and security-event review must pass before reopening traffic.
5. **Communicate:** record impact, decisions, owners, timestamps, and next update. Notify affected parties according to applicable obligations without speculating.
6. **Follow up:** rotate exposed secrets, patch root cause, add a regression test, retain evidence under the approved audit window, and complete a blameless review.

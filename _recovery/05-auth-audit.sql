\echo ===== recent auth audit events =====
SELECT "eventType", outcome, "createdAt"
FROM audit_events
ORDER BY "createdAt" DESC
LIMIT 15;

\echo ===== recovery code consumption =====
SELECT count(*) FILTER (WHERE "usedAt" IS NULL)     AS unused,
       count(*) FILTER (WHERE "usedAt" IS NOT NULL) AS used
FROM recovery_codes;

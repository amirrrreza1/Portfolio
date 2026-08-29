\echo ===== sessions issued =====
SELECT s.id, s."createdAt", s."expiresAt", s."revokedAt", s."revokedReason"
FROM sessions s ORDER BY s."createdAt" DESC LIMIT 10;

\echo ===== recovery code consumption =====
SELECT count(*) FILTER (WHERE "usedAt" IS NULL)     AS unused,
       count(*) FILTER (WHERE "usedAt" IS NOT NULL) AS used
FROM recovery_codes;

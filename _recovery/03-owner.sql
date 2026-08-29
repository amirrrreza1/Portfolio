SELECT u.email,
       u.role,
       u.status,
       u."createdAt",
       (SELECT count(*) FROM webauthn_credentials w WHERE w."userId" = u.id) AS passkeys,
       (SELECT count(*) FROM recovery_codes r WHERE r."userId" = u.id AND r."usedAt" IS NULL) AS unused_codes,
       (SELECT count(*) FROM recovery_codes r WHERE r."userId" = u.id) AS total_codes
FROM users u
ORDER BY u."createdAt";

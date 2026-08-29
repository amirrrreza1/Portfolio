-- Deletes the owner account so provision:owner can run again and print a fresh
-- set of recovery codes.
--
-- Safe by schema: sessions, passkeys, recovery codes and post drafts cascade;
-- posts, media assets, audit events and slug redirects keep their rows with the
-- actor set to null. No Restrict relation points at users, so nothing blocks.
-- Portfolio content - projects, skills, certificates, page sections - is not
-- touched at all.
BEGIN;
DELETE FROM users WHERE role = 'OWNER';
COMMIT;

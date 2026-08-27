# Runbook — owner recovery and credential revocation

Owner: whoever holds database access to the deployment.  
Rehearsed: see [`M6-recovery-revocation-drill.md`](../status/evidence/M6-recovery-revocation-drill.md).  
Covers: [SECURITY.md](../SECURITY.md) §3, §4, §13 and the M6 exit gate's third condition.

This runbook is for two situations that look similar and are not:

| Situation                                                                | Drill |
| ------------------------------------------------------------------------ | ----- |
| The owner cannot sign in. Nothing is known to be compromised.            | **A** |
| A passkey, device, or session is believed to be in someone else's hands. | **B** |

Drill A restores access. Drill B removes it from someone else. Running A when
you meant B leaves the attacker signed in.

## Before either drill

Both drills need a shell with `DATABASE_URL` pointing at the deployment's
PostgreSQL, and the repository checked out with `pnpm install` done. Neither
needs the API to be stopped.

Know these three facts before you start, because both drills branch on them:

```bash
psql "$DATABASE_URL" -c "select email, status from users where role = 'OWNER'"
pnpm --filter @portfolio/database revoke:credentials -- \
  --email "$OWNER_EMAIL" --list
psql "$DATABASE_URL" -c \
  "select count(*) from recovery_codes rc join users u on u.id = rc.\"userId\"
   where u.email = '$OWNER_EMAIL' and rc.\"usedAt\" is null"
```

How many passkeys exist, and how many unused recovery codes remain. **If both
numbers would reach zero, stop.** An account with no passkey and no unused code
cannot be signed into by anybody, and the only remedy left is re-provisioning,
which means a new account and a new audit identity.

---

## Drill A — the owner has lost their passkey

Preconditions: at least one unused recovery code. If there is none, skip to
[Re-provisioning](#re-provisioning-last-resort).

1. **Sign in with a recovery code.** Open `/admin/recovery`, enter the owner's
   email and one code.

   The code is consumed on use, every other session for that account is
   revoked, and a security notification is sent to the owner's address. All
   three are automatic. The session sweep is the point: if the passkey was lost
   rather than merely forgotten, this is the step that ends any session it had
   established.

2. **Enrol a replacement passkey immediately**, from the shell's _Passkeys_
   section. Do this in the same sitting. The session you are holding came from
   a code, and codes are finite.

3. **Verify the new key works on its own.** Sign out, then sign in again with
   password plus the new passkey. Do not skip this: an enrolment that appeared
   to succeed but bound the wrong authenticator is only visible here.

4. **Remove the lost passkey**, so a found device cannot be used later:

   ```bash
   pnpm --filter @portfolio/database revoke:credentials -- \
     --email "$OWNER_EMAIL" --list
   pnpm --filter @portfolio/database revoke:credentials -- \
     --email "$OWNER_EMAIL" --credential <id-of-the-lost-key> --apply
   ```

   This also signs out every session, including yours. Sign in again.

5. **Check the remaining code count.** If it is low, re-issue. There is no
   endpoint for this — it is the same deployment-level action as provisioning.

## Drill B — a credential or session is compromised

Work in this order. It is not the intuitive one, and the reason is in step 1.

1. **Revoke the sessions first, from a session you trust.** Sign in on a device
   you are confident about, and revoke every other session from the shell's
   _Active sessions_ list. Revoking sessions before touching credentials is
   what closes the window: an attacker holding a live session does not need the
   passkey any more, so removing the key first would leave them signed in while
   telling you the problem was solved.

   If you cannot sign in at all, use a recovery code — that alone sweeps every
   session — and continue from step 2.

2. **Revoke the compromised passkey.**

   ```bash
   pnpm --filter @portfolio/database revoke:credentials -- \
     --email "$OWNER_EMAIL" --credential <id> --apply
   ```

   The script refuses to leave the account with neither a passkey nor an unused
   recovery code. If it refuses, issue recovery codes first and re-run it.

3. **Confirm the revoked key no longer authenticates.** Attempt a sign-in with
   it. The expected result is the ordinary refusal — the same message a wrong
   password gets, because the API does not distinguish.

4. **Rotate the password**, if the password may also be known. This is separate
   from the passkey and is not covered by step 2.

5. **Preserve the evidence before it ages out.**

   ```bash
   psql "$DATABASE_URL" -c \
     "select \"createdAt\", \"eventType\", outcome, \"ipPrefixHash\", metadata
      from audit_events order by \"createdAt\" desc limit 200" > incident-audit.txt
   ```

   Audit records carry no credentials, tokens, or bodies by design, so this
   file is safe to attach to an incident report.

6. **If the deployment itself may be compromised**, rotate `SESSION_SECRET`,
   `CSRF_SECRET`, and `RECOVERY_SECRET`. Each invalidates a different thing:
   sessions, CSRF tokens, and every stored recovery-code hash respectively.
   Rotating `RECOVERY_SECRET` makes existing codes unusable, so issue new ones
   in the same maintenance window.

   `WEBAUTHN_RP_ID` is **not** on that list. Changing it invalidates every
   registered passkey, because a credential is bound to the relying party at
   enrolment.

## Re-provisioning (last resort)

Only when no passkey and no unused recovery code remain. This creates a new
owner identity; audit history stays attached to the old one.

```bash
psql "$DATABASE_URL" -c "update users set status = 'DISABLED' where role = 'OWNER'"
# then, with a fresh bootstrap token file and a future expiry:
pnpm --filter @portfolio/database provision:owner
```

`provision:owner` refuses to run while an `OWNER` row exists, which is why the
old one is disabled rather than deleted — deleting it would cascade the audit
trail away with it.

## What each command changes

| Action                          | Sessions           | Passkeys           | Recovery codes    |
| ------------------------------- | ------------------ | ------------------ | ----------------- |
| Sign in with a recovery code    | all others revoked | unchanged          | that one consumed |
| Revoke a session from the shell | that one           | unchanged          | unchanged         |
| `revoke:credentials`            | **all** revoked    | named ones removed | unchanged         |
| Rotate `SESSION_SECRET`         | all invalid        | unchanged          | unchanged         |
| Rotate `RECOVERY_SECRET`        | unchanged          | unchanged          | **all invalid**   |

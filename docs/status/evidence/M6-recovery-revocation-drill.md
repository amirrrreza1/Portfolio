# M6 — owner recovery and credential-revocation drill, rehearsed

Run date: **2026-08-27**  
Result: **11 steps, all passing**  
Runbook: [`docs/runbooks/owner-recovery-and-revocation.md`](../../runbooks/owner-recovery-and-revocation.md)  
Command: `pnpm --filter @portfolio/web test:e2e:admin -- recovery-drill`

This is the third exit condition of [M6](../M6.md): _an owner recovery and
credential-revocation drill is documented and repeatable_.

The runbook is the document an operator follows. `e2e/admin/recovery-drill.spec.mts`
is that document executed — the same commands, against the same stack, in the
same order. A drill that happened once by hand on a machine nobody kept is
documented but not repeatable, so the rehearsal is written as something that
can be run again and can fail.

## What is actually being run

Where the runbook says "run this command", the rehearsal runs that command in a
child process — `pnpm --filter @portfolio/database revoke:credentials`, not an
imitation of it. Where it says "open `/admin/recovery`", a real Chromium does.
The passkeys are Chrome virtual authenticators producing real ES256 signatures;
the API verifies them against real PostgreSQL rows.

Stack as recorded in [the shell run](M6-admin-shell-live.md): PostgreSQL 16.13,
API on `127.0.0.1:4340`, web on `localhost:3340`, Chromium 141 via Playwright
1.62.1.

## Transcript

```
setup    — signed in with a recovery code and enrolled "Old laptop"
A1       — recovery code accepted, shell reached
A1       — the pre-existing session was revoked by the recovery sign-in
A1       — a spent recovery code is refused
throttle — waited 60s for the recovery throttle
A2       — enrolled "Replacement key" from the recovery session
A3       — password plus the replacement passkey reaches the shell
A4       — Signed out 2 session(s).
A4       — the operator's own session was ended by the revocation
A4       — a device without the surviving passkey cannot sign in
B1       — revoked 1 other session(s) from the shell
B1       — the compromised session's cookie is dead
B2       — revoking the last passkey with no codes left is refused
B2       — the compromised passkey was removed and all sessions ended
B3       — the revoked passkey is refused at sign-in
B5       — audit events present, and free of credentials
close    — account restored with "Post-incident key"
```

The `throttle` line is not a defect and is not skipped. Recovery carries a
stricter progressive throttle than login, deliberately, because a code is a
bearer credential. The rehearsal reads the number of seconds off the page and
waits, which is what the runbook tells an operator to do.

## What each drill establishes

### Drill A — the owner has lost their passkey

- **A1.** A recovery code authenticates _and_ sweeps every other session. The
  sweep is verified from a session established before the incident: its cookie,
  replayed in a fresh browser, no longer works. The same code is then refused
  on reuse.
- **A2–A3.** A replacement passkey is enrolled from the recovery session, and
  then proven on its own — sign out, sign back in with password plus the new
  key. Skipping that second half would leave an enrolment that appeared to
  succeed but bound the wrong authenticator invisible until the codes ran out.
- **A4.** `revoke:credentials --credential <id> --apply` removes the lost key,
  reports `Passkeys remaining: 1`, and signs out **two** sessions — including
  the operator's own. The runbook warns about that, and the drill proves the
  warning is accurate rather than defensive.

### Drill B — a credential is compromised

- **B1.** Sessions are revoked **first**, from a trusted session, before the
  credential is touched. The order is the whole point: an attacker holding a
  live session no longer needs the passkey, so removing the key first would
  leave them signed in while reporting the problem solved. The compromised
  session's cookie is confirmed dead in a fresh browser.
- **B2.** The guard is exercised deliberately: with every recovery code spent,
  revoking the last remaining passkey is **refused**, because it would lock the
  account out permanently with no way back. This is the single most damaging
  operator mistake the script can prevent, so the drill spends the codes,
  confirms the refusal, and restores exactly the codes it spent.
- **B2–B3.** The compromised passkey is then revoked properly (`Passkeys
remaining: 0`, with the script telling the operator to sign in with a code and
  enrol one), and the revoked key is confirmed refused at sign-in.
- **B5.** The audit trail carries `auth.credential.revoked`, `auth.recovery.used`
  and `auth.login`, and the drill asserts that the owner's password and every
  recovery code appear **nowhere** in the last hundred records — the file an
  incident report would attach is safe to attach.

### The close

The last step re-enters through recovery and enrols a fresh key. If the final
state of an incident response is "and now nobody can sign in", the runbook is
wrong, so the drill ends by proving the account is usable.

## What the drill needed that did not exist

**A way to revoke a credential.** API_SPEC.md §5 lists ten authentication
endpoints and none deletes a passkey — deliberately, since an endpoint that
strips credentials is one an attacker with a live session can use to remove the
owner's last way in. Revocation of a _key_ is therefore a deployment action, at
the same trust level that provisioned the account.

It was, however, undocumented and unscripted, which made the runbook
unrehearsable: "delete the right row, and remember to clear the sessions too"
is a step that gets done wrong at three in the morning, and removing the
credential alone revokes nothing an attacker cares about, because their session
survives it.

`packages/database/scripts/revoke-credentials.ts` now does both in one
transaction, writes an audit record, and refuses the lockout case.

**Recovery codes at provisioning.** See defect 3 in
[the shell run](M6-admin-shell-live.md). Drill A's first step was impossible
until it was fixed.

## Re-running

The drill is destructive: it spends recovery codes, revokes passkeys, and ends
sessions. Run it against a stack you are willing to reset, from a freshly
provisioned owner.

```bash
psql "$DATABASE_URL" -c 'delete from sessions' \
  -c 'delete from webauthn_credentials' -c 'delete from recovery_codes' \
  -c 'delete from audit_events' -c 'delete from users'
pnpm --filter @portfolio/database provision:owner     # keep the printed codes

E2E_ADMIN_BASE_URL=http://localhost:3340 \
E2E_OWNER_EMAIL=owner@example.test \
E2E_OWNER_PASSWORD=... \
E2E_RECOVERY_CODES=code1,code2,...,code10 \
E2E_DATABASE_URL="$DATABASE_URL" \
pnpm --filter @portfolio/web test:e2e:admin -- recovery-drill
```

`E2E_RECOVERY_CODES` needs at least three unused codes. The in-process login
and recovery throttles live in the API, so a stack that has already absorbed a
failed run will make the next one wait; restarting the API resets them.

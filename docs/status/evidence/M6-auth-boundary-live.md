# Authentication boundary — live run

Date: **2026-08-27**  
Milestone: [M6](../M6.md)

The first run of the admin boundary as a running system: real HTTP against the
real Nest API, real PostgreSQL, real Argon2id, and real ES256 passkey
assertions. A login here is a login, and every refusal below is the shipped
code refusing.

## What was run

| Component     | What it actually was                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| API           | `apps/api` on Nest/Fastify with all ten API_SPEC §5 routes mapped, no stubbed providers                                                      |
| Database      | PostgreSQL 16.13, holding the owner, the passkey, the recovery code, sessions, and audit                                                     |
| Authenticator | `apps/api/scripts/software-authenticator.ts` — a P-256 keypair, hand-encoded COSE_Key and `none`-attestation CBOR, and real ECDSA signatures |
| Password      | Argon2id at the shipped 64 MiB / 3-iteration profile                                                                                         |

The assertions live in `apps/api/scripts/verify-auth-boundary.ts`:

```bash
DATABASE_URL=... API_ORIGIN=... WEB_ORIGIN=... WEBAUTHN_RP_ID=... RECOVERY_SECRET=... \
pnpm --filter @portfolio/api verify:auth
```

The software authenticator is the point of the exercise. A stubbed verifier
returning `verified: true` proves the code calls a library; it proves nothing
about whether a forged assertion, one signed for another origin, or a replayed
one would be refused — which is the entire security property. Everything below
is checked against signatures that are actually valid, or actually are not.

## Result

`ALL CHECKS PASSED — 24 checks`.

### 1–2. The boundary is closed, and two factors open it

```
PASS  an unauthenticated session read is refused  — HTTP 401
PASS  a forged session cookie is refused
PASS  the password step sets no session cookie  — 0 cookie(s)
PASS  auth responses are never cacheable  — private, no-store
PASS  a wrong password and an unknown account answer identically  — both HTTP 200
PASS  a real assertion over a live challenge issues a session  — HTTP 200
PASS  the session describes the actor and nothing more  — HTTP 200
```

The uniform password response is not cosmetic. A correct password and a
nonexistent account both return a challenge with identical keys; the failure
surfaces one step later, where it is indistinguishable from an authenticator
declining.

### 3. Assertions cannot be replayed or borrowed

```
PASS  the same assertion is accepted once and refused on replay  — 200 then 401
PASS  a valid passkey cannot rescue a failed password step  — HTTP 401
```

The second line is the one that matters most: a genuine, correctly signed
assertion from the owner's own passkey is refused when the password step it
belongs to failed, because that challenge was bound to no user.

### 4–5. Browser defences and session lifetime

```
PASS  a login from another origin is refused  — HTTP 403
PASS  a cookie-authenticated mutation without a CSRF token is refused  — HTTP 403
PASS  a cookie-authenticated mutation with the wrong CSRF token is refused  — HTTP 403
PASS  the session list shows a coarse client and never a raw token  — 2 session(s)
PASS  logout revokes the session and the cookie stops working immediately  — 204 then 401
```

### 6–7. Recovery and the audit trail

```
PASS  a recovery code authenticates and revokes every existing session  — 200, displaced 401
PASS  the same recovery code cannot be used twice  — HTTP 401
PASS  the security events SECURITY.md §13 names are recorded
PASS  no audit record carries a password, a code, or a token  — 10 record(s) inspected
```

Recovery revoking every other session is deliberate: a recovery code is used
when the owner believes they have lost control, and leaving other sessions
alive would defeat the point. The session displaced by it stopped working
immediately.

### 8–9. Enrolling and using a second passkey

```
PASS  enrolment cannot be started without a CSRF token  — HTTP 403
PASS  the options exclude the passkey already registered  — HTTP 200
PASS  a verified registration is stored as a usable credential  — HTTP 201
PASS  the stored credential belongs to the enrolling owner and carries its label
PASS  the newly enrolled passkey completes a login  — HTTP 200
```

Enrolment is authenticated and recent-auth gated, which answers the bootstrap
question without inventing a second concept: provisioning issues recovery
codes, a code buys a session, and the first passkey is enrolled from that
session. There is no window in which an unauthenticated caller may register a
credential.

### 10. Throttling

```
PASS  repeated failures are progressively throttled  — 5 of 9 attempts refused with 429
```

Run last, deliberately, because it fills the buckets every check above depends
on not being in.

## What the run found

**Every passkey login was impossible, and no unit test could see it.**
`generateAuthenticationOptions` base64url-encodes whatever challenge it is
given. It was being handed the challenge _already_ base64url-encoded, so the
options carried a doubly encoded value — the browser would sign that, and the
verify step compared it against the singly encoded stored value. Every
assertion failed with `Unexpected authentication response challenge`.

The unit suite could not catch it because those tests read the challenge from
the store record directly, exactly as the verifier does, so the two agreed and
the encoding never mattered. Fixed by decoding to bytes before generating the
options, and `loginTo` in `apps/api/test/auth.spec.ts` now goes through
`authenticationOptions` so the challenge a test signs is the challenge the
endpoint actually hands out.

**The password step was minting a session.** `PasswordLoginService` created one
on a correct password, before any passkey was involved — a single-factor
session for a flow SECURITY.md §3 requires two factors to complete. It now
returns a verified user id and nothing else; session issuance moved to the
assertion step. Its store interface lost `createSession`, and
`packages/database/src/auth.ts` lost the adapter method that fed it.

**A verifier's refusal reason was going nowhere.** The library's message says
which check failed — expired challenge, wrong origin, bad signature — and it
was being swallowed by a bare `catch`. It is now written to the server log and
still never to the response: an operator needs it to debug a real
authenticator, and an attacker must not be told which guess was closest.

## What this does not prove

- **No browser.** Assertions come from a software authenticator, which is the
  right tool for testing refusals but is not a platform authenticator. A real
  passkey on real hardware has not been through this flow.
- **`__Host-` cookies were not exercised.** The run is over HTTP on
  `127.0.0.1`, so cookies use the bare names; the `__Host-` prefix and `Secure`
  apply only when the configured origin is HTTPS. That path is untested here.
- **No admin shell.** Nothing yet uses this boundary to protect a page, so
  "the admin shell cannot be reached without verified credentials" remains
  unproven by construction — there is no shell.
- **No recovery drill.** Recovery works, but the documented, repeatable owner
  recovery and credential-revocation drill the exit gate asks for has not been
  written or rehearsed.
- **Single process.** The throttle is in-process by design; SECURITY.md §12
  requires a shared limiter or edge enforcement before more than one replica,
  and M9 owns that.
- **`EDITOR` was not exercised**, because it cannot currently be assigned. See
  [M6](../M6.md).

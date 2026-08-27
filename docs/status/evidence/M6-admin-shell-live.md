# M6 — the admin shell, proven in a browser

Run date: **2026-08-27**  
Result: **10 checks, all passing**  
Command: `pnpm --filter @portfolio/web test:e2e:admin -- admin-boundary`

This is the first exit condition of [M6](../M6.md): _the admin shell cannot be
reached without verified credentials_. The
[API auth boundary run](M6-auth-boundary-live.md) already proved the endpoints
refuse; this proves the **shell** does, in a real browser, with a real
authenticator, against a real PostgreSQL.

## Why a browser was necessary

The API's own verification drives the ten §5 endpoints with
`apps/api/scripts/software-authenticator.ts` — a hand-built ES256 authenticator
that produces genuine signatures. It cannot exercise anything a browser decides
for itself: whether `navigator.credentials` will accept the relying party at
all, whether the CSP blocks the panel's own scripts, whether a redirect happens
before markup is sent, or whether Chrome will hand back a response shape the
contract actually accepts.

**Both of the defects this run found were invisible to every other layer.**
They are recorded below.

## The stack under test

| Component  | Version / setting                                                                |
| ---------- | -------------------------------------------------------------------------------- |
| PostgreSQL | 16.13 — note the gap from the 17 target; no 17 is available in this environment  |
| API        | `apps/api` on `http://127.0.0.1:4340`, real Prisma + PostgreSQL                  |
| Web        | `next build` + the standalone server on `http://localhost:3340`                  |
| Browser    | Chromium 141.0.7390.37 via Playwright 1.62.1                                     |
| WebAuthn   | Chrome virtual authenticator: CTAP2.1, internal, resident key, user verification |
| Owner      | `provision:owner`, then bootstrapped exactly as the runbook says                 |

The origin is `localhost`, not `127.0.0.1`, and that is not cosmetic — see
defect 1.

## Checks

### The boundary refuses

| #   | Check                                                                                                    | Result |
| --- | -------------------------------------------------------------------------------------------------------- | ------ |
| 1   | `/admin`, `/admin/`, and `/admin/anything` all land on `/admin/login` when signed out                    | pass   |
| 2   | A **forged** session cookie is refused — it passes the proxy's presence check and is stopped by the API  | pass   |
| 3   | A signed-out `GET /admin` answers `307` and its body contains no shell markup                            | pass   |
| 4   | Admin responses carry the admin CSP, `X-Robots-Tag`, COOP/CORP/COEP, and the WebAuthn permissions policy | pass   |

Check 2 is the one that matters. The proxy's cookie check is a fast path, not
the boundary; a request holding any non-empty session cookie gets past it. What
refuses it is `requireAdminActor()`, which asks the API on every render.

Check 3 exists because "renders and then redirects" is the classic failure of a
client-side guard: by the time the redirect runs, the markup has already been
sent. Following redirects would have hidden that.

### The bootstrap

| #   | Check                                                                     | Result |
| --- | ------------------------------------------------------------------------- | ------ |
| 5   | A recovery code buys a session, and that session enrols the first passkey | pass   |

This is the only order in which an owner with no passkey can obtain one, and
until this milestone it did not work at all — see defect 3.

### Two-factor sign-in

| #   | Check                                                                | Result |
| --- | -------------------------------------------------------------------- | ------ |
| 6   | A wrong password is refused **at the passkey step**, not before it   | pass   |
| 7   | Password plus a cryptographically verified passkey reaches the shell | pass   |
| 8   | The shell renders with zero CSP violations reported by the browser   | pass   |

Check 6 is the anti-enumeration property, observed rather than asserted from
the code: the passkey prompt appears for a doomed flow exactly as it does for a
real one, because the password step returns a challenge either way and
`/auth/webauthn/options` never sends `allowCredentials`.

### Session control — ADMIN-002

| #   | Check                                                                                            | Result |
| --- | ------------------------------------------------------------------------------------------------ | ------ |
| 9   | The list shows exactly one current session; revoking another kills its cookie in a fresh browser | pass   |
| 10  | Signing out revokes server-side — the same cookie replayed in a fresh context is refused         | pass   |

Both check the cookie in a **new browser context**, because a session that is
merely absent from a list, or cleared from one browser, is not revoked.

## Defects this run found

### 1. A relying-party ID may not be an IP address

The stack was first stood up on `http://127.0.0.1:3310`, which made
`WEBAUTHN_RP_ID=127.0.0.1`. Chrome refuses that with a `SecurityError` before
any authenticator is consulted: a relying-party ID must be a domain. The
software authenticator has no such rule and had never objected.

Fixed by running on `localhost`. The panel now reports the case usefully — a
`SecurityError` was previously rendered as "Something went wrong. Try again.",
which sent the operator hunting through the authenticator instead of at the one
environment variable that was wrong.

`.env.example` was already correct (`WEBAUTHN_RP_ID=localhost`); only the test
stack was misconfigured. The lesson is recorded here because the failure mode —
a production deployment addressed by IP — is silent until someone tries to
enrol.

### 2. The registration contract rejected every real browser

`webAuthnRegistrationSchema` is `.strict()` and did not list
`authenticatorAttachment`. Every browser that completes
`navigator.credentials.create()` includes that field, so **every genuine
enrolment failed with `VALIDATION_FAILED`** while all 27 unit tests and all 24
live API checks passed.

They passed because `software-authenticator.ts` builds its payload by hand and
had no reason to send a field the schema never asked for. The assertion schema
beside it has always accepted `authenticatorAttachment`; the registration half
simply never did.

Fixed in `packages/contracts/src/auth/session.ts`. The value is recorded, not
trusted — it is a client hint about where the key lives and no decision is made
on it.

> **The lesson, which generalizes:** a test double built from the same
> understanding as the code under test agrees with it by construction. The M6
> auth slice already recorded one of these — a doubly-encoded challenge that
> unit tests could not see because they read the value from the same place the
> verifier did. This is the same shape of mistake in a different place, and it
> took a real browser to see it too.

### 3. Provisioning issued no recovery codes

Not found by the browser, found while building the harness for it, and it is
the most serious of the three.

`provision:owner` created the owner row and nothing else. A freshly provisioned
owner therefore had a password, no passkey, and no recovery code — and since
login requires a passkey assertion, and enrolling a passkey requires an
authenticated session, and the only way to get a session without a passkey is a
recovery code, **a newly provisioned owner could never sign in.** The
documented bootstrap had no first step.

`issueRecoveryCodes` already existed in `@portfolio/auth-core`, fully tested,
and was called by nothing. The verification script hand-created a code row in
its own setup and described it as "exactly what the provisioning command plus a
first enrolment would leave" — which is precisely what it was not.

`provision-owner.ts` now issues ten codes in the same transaction as the owner
and prints them once. `RECOVERY_SECRET` was added to `.env.example`, which had
never listed it.

## Re-running

The stack must be up before the run; this config starts no servers, because the
claim under test is about a real API and a real database and a fixture would
prove nothing about either.

```bash
# 1. PostgreSQL, migrations, provisioning (see the drill evidence for the
#    scripted form). Keep one recovery code from the output.
# 2. API and web on matching origins:
#      WEBAUTHN_ORIGIN must equal the web origin exactly, and must be a
#      hostname, never an IP literal.
# 3. Then:
E2E_ADMIN_BASE_URL=http://localhost:3340 \
E2E_OWNER_EMAIL=owner@example.test \
E2E_OWNER_PASSWORD=... \
E2E_RECOVERY_CODE=xxxxx-xxxxx-xxxxx-xxxxx \
pnpm --filter @portfolio/web test:e2e:admin -- admin-boundary
```

The run needs one unused recovery code and an owner with no passkey, so it
starts from a freshly provisioned account.

## The policy on an admin response

Captured from `GET /admin` while signed out:

```
HTTP/1.1 307 Temporary Redirect
location: /admin/login
cache-control: private, no-store
content-security-policy: default-src 'self'; base-uri 'self'; object-src 'none';
  frame-ancestors 'none'; frame-src 'none'; worker-src 'none';
  manifest-src 'none'; media-src 'none';
  script-src 'self' 'nonce-CFQPo89ia7v80ivpeKpHGw==';
  style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';
  connect-src 'self'; form-action 'self'
cross-origin-embedder-policy: require-corp
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
permissions-policy: camera=(), microphone=(), geolocation=(), payment=(),
  usb=(), publickey-credentials-get=(self), publickey-credentials-create=(self)
referrer-policy: no-referrer
vary: Cookie
x-content-type-options: nosniff
x-frame-options: DENY
x-robots-tag: noindex, nofollow, noarchive
```

`style-src` still carries `'unsafe-inline'`. That is inherited from the shared
stylesheet, not chosen here: SECURITY.md §10 requires component-level inline
styles to be removed repository-wide rather than allowed, and the admin policy
cannot be tighter than the sheet it shares until that lands. It is the only
clause in which the admin policy is not stricter than the public one.

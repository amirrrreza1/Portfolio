# Security specification

## 1. Security objective

Protect the single-owner publishing system against account takeover, content tampering, draft/private-content disclosure, injection, malicious uploads, contact-form abuse, secret leakage, supply-chain compromise, and loss of recoverability.

No system can promise “maximum security.” This document establishes defense in depth and mandatory release gates. Any exception requires a written risk decision and compensating control.

## 2. Trust boundaries and sensitive assets

Untrusted inputs include every browser value, Markdown document, URL, uploaded file, request header, proxy header, database row created from old data, webhook/invalidation request, and third-party API response.

Highest-value assets:

- owner/editor credentials, WebAuthn records, recovery codes, and sessions
- unpublished posts and preview links
- database/storage/mail credentials
- content integrity, redirects, resume and downloadable files
- contact names, email addresses, and message bodies
- audit/revision history and backups

## 3. Authentication

- Public self-registration MUST NOT exist.
- Initial owner provisioning MUST be an explicit one-time deployment command with an expiring bootstrap input.
- Passwords MUST be checked against a minimum length and breached/common-password policy without imposing composition tricks.
- Passwords MUST be hashed with Argon2id using unique salts and parameters calibrated on production hardware. Start at a memory-hard profile of at least 64 MiB, three iterations, parallelism one, then tune to a bounded login latency and store parameters for future rehash.
- Login and recovery endpoints MUST apply per-account and per-network progressive throttles without revealing whether an account exists.
- Owner login MUST complete WebAuthn/passkey verification after password verification. TOTP is not the preferred second factor because it is phishable.
- WebAuthn challenges MUST be random, single-use, short-lived, origin/RP-bound, and stored server-side.
- Recovery codes MUST be random, one-time, hashed at rest, displayed once, and trigger a security notification when used.
- Password, passkey, recovery, role, permanent-delete, and session-wide actions require a recent authentication window.

## 4. Sessions and cookies

- Use an opaque random session token with at least 256 bits of entropy; store only a keyed/cryptographic hash in PostgreSQL.
- Rotate the token at login, privilege/re-auth transitions, and sensitive account changes.
- Production cookie: `__Host-portfolio_session`; `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Domain`.
- Enforce both inactivity and absolute expiration. A suggested admin starting point is 30 minutes idle and 12 hours absolute, configurable downward.
- Revoke sessions server-side on logout, expiration, password/security changes, owner disable, or suspicious behavior.
- The owner can inspect summaries and revoke other sessions. Raw tokens, precise IP addresses, and full browser strings are never displayed.
- Auth/admin responses and pages use `Cache-Control: private, no-store` and must not enter shared caches.

## 5. Authorization

- Deny by default. Every protected controller uses a server-side authentication guard and explicit permission policy.
- Object-level checks prevent editors from accessing forbidden resources through guessed IDs.
- High-risk owner-only actions are enforced in services/repositories, not just routes or UI.
- Public queries include status/time/archival predicates at the repository level so drafts cannot leak through alternate controllers.
- Database credentials use least privilege; the API role cannot alter schema or audit history.

## 6. CSRF, CORS, and request integrity

- Keep browser API traffic same-origin. Do not enable wildcard or reflected credentialed CORS.
- All state-changing cookie-authenticated requests require a server-issued session-bound CSRF token and strict `Origin`/`Sec-Fetch-Site` validation.
- Only accept mutation content types that the endpoint expects; reject ambiguous form/simple requests where not required.
- Login CSRF is handled by origin checks and pre-auth flow binding.
- Signed server-to-server cache invalidation includes timestamp, nonce, body digest, constant-time signature comparison, a narrow clock window, and replay storage.
- Proxy trust is configured to the known proxy count/ranges only; client-supplied forwarding headers are otherwise ignored.

## 7. Input, output, and content safety

- All inputs use strict Zod schemas with size/range limits and rejection of unknown keys.
- Prisma parameterization is used; raw SQL is exceptional, reviewed, and parameterized.
- Markdown raw HTML and MDX execution are disabled. Rendering uses a schema-based HTML sanitizer; links reject `javascript:`, `data:` (except an explicit safe image policy), and unsafe protocols.
- React output escaping remains enabled. `dangerouslySetInnerHTML` is prohibited except a reviewed JSON-LD serializer that escapes `<` and a reviewed sanitized-content boundary.
- User-entered outbound URLs are normalized and validated. Server-side URL fetches use fixed allowlisted hosts, DNS/IP checks, timeouts, response-size limits, and no arbitrary redirects to prevent SSRF.
- Current GitHub statistics fetching moves to a server adapter with repository allowlisting, authentication where configured, caching, and bounded failure behavior.

## 8. Upload and media controls

- Stream uploads; do not buffer unbounded bodies.
- Enforce proxy and application limits before expensive parsing. Each allowed media class has explicit maximum size and dimensions/pages.
- Verify magic bytes and decode content; never trust extension, user filename, or supplied MIME type.
- Generate random storage keys; strip path separators/control characters from display filenames.
- Decode/re-encode accepted images and strip metadata. SVG uploads are disabled unless a future sanitizer/isolation design is separately approved.
- PDF files are quarantined until validated/scanned, served with `Content-Type: application/pdf`, safe disposition, `X-Content-Type-Options: nosniff`, and preferably from a separate asset origin.
- Uploaded content cannot overwrite application code or public directories.
- Object-storage credentials are server-only and limited to the configured bucket/prefix. Public listing is disabled.
- Replacing the resume is a transactional metadata activation; old objects are retained for rollback until retention expires.

## 9. Contact form and abuse

- Remove public EmailJS credentials and send mail only from the API adapter.
- Validate lengths, normalize email safely, reject header injection, and escape content in mail templates.
- Apply layered rate limits, a honeypot, minimum completion time, and optional privacy-respecting challenge after suspicious behavior.
- Return the same generic success response when appropriate to reduce probing and retry storms.
- Store contact content only when needed, encrypt storage/backups, limit owner access, and automatically delete after the retention window.
- Never include untrusted message content in log lines, alert titles, or HTML email without escaping.

## 10. Browser and transport policy

TLS is mandatory outside local development. The edge adds HSTS after HTTPS is confirmed on all required subdomains.

Minimum response policy:

- nonce- or hash-based Content Security Policy with no `unsafe-eval`; phase out inline styles/scripts where feasible
- `frame-ancestors 'none'` (and `X-Frame-Options: DENY` for legacy coverage)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- restrictive `Permissions-Policy`
- explicit `Cross-Origin-Opener-Policy`/resource policy tested against WebAuthn and required assets
- admin and preview routes include `X-Robots-Tag: noindex, nofollow, noarchive`

External links opened in a new context use `rel="noopener noreferrer"`. Third-party scripts require a documented necessity, pinned/integrity-protected delivery where supported, CSP allowance, and privacy review.

## 11. Secrets and data protection

- Commit only `.env.example` placeholders. Secret scanning runs in CI and pre-commit tooling where available.
- Production secrets come from the deployment secret manager or mounted runtime secrets, not image build arguments/layers.
- Database URLs, session/CSRF keys, SMTP URLs, S3 keys, WebAuthn flows, and signed URLs are redacted from logs and error reports.
- Independent secrets serve independent purposes and support rotation.
- Backups are encrypted, access-controlled, retention-limited, and restore-tested.
- Sensitive values are excluded from revision snapshots and audit metadata by explicit allowlist.

## 12. Rate limiting and availability

- Separate policies apply to login, WebAuthn/recovery, contact, uploads, admin mutations, and public reads.
- Limits use a trusted client identity strategy behind the known proxy. Horizontal deployment requires a shared limiter store or edge enforcement.
- Body, header, URL, multipart part, and parsing-depth limits are set globally and tightened per endpoint.
- All outbound database/HTTP/SMTP/storage calls have timeouts and bounded retries with jitter only for safe/idempotent operations.
- Graceful shutdown stops accepting requests, completes bounded in-flight work, and closes pools.
- Readiness fails when required dependencies are unavailable; liveness does not expose details or create restart loops for a transient downstream outage.

## 13. Logging, audit, and response

- Structured logs carry timestamp, level, service, environment, request ID, route template, status, duration, and safe actor/target IDs.
- Security events include failed/successful login, recovery use, credential changes, session revocation, permission denial, publish/unpublish, resume activation, role change, and permanent delete.
- Audit records are append-only through the application role and redact payloads.
- Alert on repeated login/recovery failures, owner security changes, unusual upload rejection, migration failure, backup failure, and repeated authorization denial.
- Maintain a runbook to revoke sessions/keys, disable admin traffic, restore content/database, preserve evidence, and communicate impact.

## 14. Supply-chain and container controls

- Direct dependency versions are pinned and `pnpm-lock.yaml` is committed/reviewed.
- pnpm lifecycle scripts are blocked by default and native build packages are explicitly allowlisted.
- CI performs lockfile-frozen install, production dependency audit, static analysis, secret scanning, image/package vulnerability scan, SBOM generation, and license review.
- Automated updates are small, tested, and reviewed; a clean audit does not replace code review.
- Container rules in [DOCKER.md](DOCKER.md) are mandatory: non-root, minimal runtime, read-only filesystem where possible, dropped capabilities, health checks, resource limits, and no published database port in production.

## 15. Security test and release gates

Release is blocked until all applicable items pass:

- authentication, WebAuthn challenge replay/origin, session fixation/rotation/revocation tests
- role and object-level authorization matrix tests
- CSRF and cross-origin negative tests for every mutation family
- draft/scheduled/archived content disclosure tests
- Markdown XSS and unsafe-link corpus tests
- upload polyglot, spoofed MIME, oversized, traversal filename, malformed image/PDF tests
- injection and malformed pagination/filter property tests
- brute-force/rate-limit and proxy identity tests
- security header/CSP checks on public, admin, preview, file, and error responses
- dependency/secret/container scans with no unresolved critical findings and reviewed high findings
- encrypted backup plus successful isolated restore and object reconciliation
- manual owner recovery and incident-revocation drill

Use an established verification standard such as OWASP ASVS as the implementation checklist, and obtain an independent review before exposing the admin panel to the public internet.

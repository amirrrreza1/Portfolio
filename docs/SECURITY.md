# Security specification

## 1. Security objective

Protect the single-owner publishing system against account takeover, content tampering, draft/private-content disclosure, injection, malicious uploads, contact-form abuse, secret leakage, supply-chain compromise, and loss of recoverability.

No system can promise “maximum security.” This document establishes defense in depth and mandatory release gates. Any exception requires a written risk decision and compensating control.

## 2. Trust boundaries and sensitive assets

Untrusted inputs include every browser value, Markdown document, YAML frontmatter block, **file read from the content repository**, appearance preferences cookie, locale path segment, URL, uploaded file, request header, proxy header, database row created from old data, webhook/invalidation request, and third-party API response.

A file in the content repository is untrusted **even though it is in our own repository**. It may arrive by a direct push, a merged pull request, or a compromised Git account, and it is therefore validated on every sync exactly as an upload would be.

Highest-value assets:

- owner/editor credentials, WebAuthn records, recovery codes, and sessions
- unpublished posts and preview links
- database/storage/mail credentials
- **the content-repository write credential and the webhook secret**
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
- The Git webhook endpoint uses the same signature discipline over the **raw request body** before any parsing, with its own independent secret. It is excluded from session middleware and CSRF, because it is signature-authenticated rather than cookie-authenticated, and a browser must not be able to reach it with ambient credentials.
- Webhook payloads are treated as triggers, not data. Affected content is always re-read from the Git API by commit SHA and re-validated, so a forged or replayed payload cannot inject content.
- Proxy trust is configured to the known proxy count/ranges only; client-supplied forwarding headers are otherwise ignored.

## 7. Input, output, and content safety

- All inputs use strict Zod schemas with size/range limits and rejection of unknown keys. Zod is the single validation stack; the `class-validator`/`class-transformer` packages currently present in the API MUST be removed rather than left as a divergent second path.
- Prisma parameterization is used; raw SQL is exceptional, reviewed, and parameterized.
- Markdown raw HTML is disabled. **MDX is never executed or compiled, at build time or at runtime**, per [ADR-004](DECISIONS.md#adr-004--markdown-with-an-allowlisted-directive-set-no-runtime-mdx-execution). An uploaded `.mdx` file is parsed as data and normalized to `.md`; imports, exports, JSX expressions, and unmapped components are rejected with a report.
- Rendering uses a schema-based HTML sanitizer as the **final** transform in the pipeline, so no later step can reintroduce unsafe output. Links reject `javascript:`, `data:` (except an explicit safe image policy), and unsafe protocols.
- Directives are a closed allowlist with validated attribute schemas ([CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) §9). No directive may emit a script, a style attribute, an event handler, or an unsandboxed iframe. An unknown directive is a write-time validation error, so it can never reach a reader.
- YAML frontmatter is parsed in safe mode: no custom tags, no arbitrary object construction, bounded document size, bounded nesting, and a bounded alias-expansion budget to prevent entity-expansion denial of service.
- **Path construction is server-side from validated identifiers only.** No user-supplied string contributes a path segment. Any resolved content path outside `content/`, any non-allowlisted locale filename, any symlink, and any unicode-normalization trick in an identifier is rejected with an audit event.
- React output escaping remains enabled. `dangerouslySetInnerHTML` is prohibited except a reviewed JSON-LD serializer that escapes `<` and exactly one reviewed sanitized-content boundary. Both are covered by XSS-corpus tests.
- Markdown parsing, sanitizing, and highlighting happen server-side only. No parser or sanitizer is shipped to the browser, so client-side rendering cannot become a bypass.
- Appearance preferences are keys selecting static, authored CSS. **No stored value is ever interpolated into a `style` attribute, a `<style>` block, a CSS custom property, or a font URL.** This is what prevents the appearance feature from becoming a CSS injection vector.
- Locale is a closed allowlist. An unrecognized locale segment is a `404`, never a coercion, and never a path or query component.
- UI message-catalog values are escaped on output and never treated as HTML.
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

- nonce- or hash-based Content Security Policy with no `unsafe-eval` and no `unsafe-inline`. Exactly one nonced inline script is permitted on public pages: the pre-paint system-theme resolver in [THEMING.md](THEMING.md) §5. It is reviewed and contains no interpolated values. Remaining inline styles in components are to be removed rather than allowed.
- `frame-ancestors 'none'` (and `X-Frame-Options: DENY` for legacy coverage)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- restrictive `Permissions-Policy`
- explicit `Cross-Origin-Opener-Policy`/resource policy tested against WebAuthn and required assets
- admin and preview routes include `X-Robots-Tag: noindex, nofollow, noarchive`

External links opened in a new context use `rel="noopener noreferrer"`. Third-party scripts require a documented necessity, pinned/integrity-protected delivery where supported, CSP allowance, and privacy review.

## 11. Secrets and data protection

- Commit only `.env.example` placeholders. Secret scanning runs in CI and pre-commit tooling where available. Because content commits are automated, secret scanning MUST also run on the content branch — an article that pastes a credential into a code block would otherwise be committed by the bot without review.
- The published EmailJS keys in the current client bundle (`NEXT_PUBLIC_EMAILJS_SERVICE_ID`, `NEXT_PUBLIC_EMAILJS_TEMPLATE_ID`, `NEXT_PUBLIC_EMAILJS_PUBLIC_KEY`) MUST be revoked and rotated at the provider. Deleting them from source does not invalidate keys that have already shipped to every visitor.
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
- draft/scheduled/archived content disclosure tests, in every locale, including the no-fallback guarantee that one locale's body never appears under another locale's URL
- Markdown XSS and unsafe-link corpus tests, plus unknown-directive and directive-attribute injection tests
- YAML frontmatter safety tests: oversized documents, deep nesting, alias expansion, unsafe tags
- content path-safety tests: traversal, absolute paths, symlinks, non-allowlisted locale filenames, unicode-normalization tricks in identifiers
- Git webhook tests: forged signature, replayed payload, timestamp outside the window, payload contents ignored as data
- content-store failure tests: invalid file in the repository does not change live output; a deleted file does not silently unpublish; Git unavailable blocks saves but not reads or scheduled publication; stale `If-Match` writes nothing
- commit-path tests: a commit outside `content/` is refused and audited; commit metadata contains no user input
- appearance tests: tampered, oversized, and disabled-option cookie values fall back safely; no stored value reaches CSS; public responses do not send `Vary: Cookie`
- upload polyglot, spoofed MIME, oversized, traversal filename, malformed image/PDF tests, plus `.mdx` uploads containing imports, exports, JSX, and raw HTML
- injection and malformed pagination/filter property tests
- brute-force/rate-limit and proxy identity tests
- security header/CSP checks on public, admin, preview, file, and error responses
- dependency/secret/container scans with no unresolved critical findings and reviewed high findings
- encrypted backup plus successful isolated restore and object reconciliation
- manual owner recovery and incident-revocation drill

Use an established verification standard such as OWASP ASVS as the implementation checklist, and obtain an independent review before exposing the admin panel to the public internet.

## 16. Content-store security

Storing article bodies in Git introduces a write-capable credential for a repository that also holds application code. That is the central risk of [ADR-003](DECISIONS.md#adr-003--git-repository-is-the-source-of-truth-for-article-bodies) and it is contained as follows.

### Credential scope

- Use a **GitHub App installation token**, not a personal access token. Installation tokens are short-lived, automatically expiring, and scoped to an installation rather than to a human account.
- The installation is limited to **one repository** with **contents: write** as its only write permission. No workflow, package, admin, or actions permission.
- The app private key is server-only, mounted at runtime, never a build argument, image layer, or repository file. It is redacted from every log and error report.
- Only the `content-store` module may hold or use the credential. No other API module, no migration script, and nothing in the web app may reach it.
- The credential MUST NOT have permission to modify workflow files. A content credential that can write CI configuration is a code-execution credential, which defeats the whole boundary.
- Rotation is documented and exercised. Compromise response: revoke the installation, rotate the app key and webhook secret, audit the commit history of the content branch, and re-validate every file against its recorded blob SHA.

### Commit-path controls

- Commits are constrained to paths under `content/` by explicit prefix validation before the request is made, in addition to whatever the host enforces. A commit attempt outside that prefix is a security event, not a validation error.
- Commit messages, author names, and bot identities come from fixed templates and configuration, never from user input, since commit metadata is public in a public repository.
- Commit messages MUST NOT contain draft text, contact messages, security details, or secrets.
- Bot commits use a distinct identity so human and automated authorship stay distinguishable in the history.
- Branch protection on the deployment branch prevents the content credential from being a route to modifying application code, even if the prefix check were bypassed.

### Sync-path controls

- Every file read from Git is fully re-validated: frontmatter schema, path/locale/ID agreement, taxonomy and media references, directive allowlist, body size, and encoding.
- A file that fails validation MUST NOT change live output. The translation is flagged, the previous good render stays published, and the owner is notified. **Broken or malicious content in the repository can neither publish itself nor take the site down.**
- Sync never deletes. A missing file is flagged and requires owner confirmation, so a force-push cannot silently erase published articles.
- Content-store operations have timeouts, bounded retries with jitter, a per-post queue, and rate-limit backoff, so a Git-host incident cannot exhaust the API.
- Git unavailability degrades authoring only. Public reads never touch Git, so an outage cannot affect readers.
- Force-overwriting a conflicting blob is owner-only, requires recent authentication and an acknowledged diff, and is separately audited.

### Availability and integrity

- The render cache is only trusted while it matches the recorded blob SHA and renderer version, so a tampered cache row cannot serve content that no file backs.
- Reconciliation detects an index row with no file, a file with no index row, a SHA mismatch, and frontmatter drift. It runs on a schedule and is available on demand.
- Recovery requires both a database backup and a repository clone to agree; a restore is invalid until reconciliation reports zero unexplained differences.

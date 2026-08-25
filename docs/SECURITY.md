# Security specification

## 1. Security objective

Protect the single-owner publishing system against account takeover, content tampering, draft/private-content disclosure, injection, malicious uploads, contact-form abuse, secret leakage, supply-chain compromise, and loss of recoverability.

No system can promise “maximum security.” This document establishes defense in depth and mandatory release gates. Any exception requires a written risk decision and compensating control.

## 2. Trust boundaries and sensitive assets

Untrusted inputs include every browser value, Markdown document, YAML frontmatter block, uploaded/imported Markdown source, appearance preferences cookie, locale path segment, URL, uploaded file, request header, proxy header, database row created from old data, signed invalidation request, and third-party API response.

Author-submitted or imported Markdown is untrusted even when created by an authenticated owner. Every save/import is validated and rendered through the bounded production sanitizer before an atomic PostgreSQL transaction can change public output.

Highest-value assets:

- owner/editor credentials, WebAuthn records, recovery codes, and sessions
- unpublished posts and preview links
- database/storage/mail credentials
- independent cache-invalidation signing secrets and publication worker credentials
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

- All inputs use strict Zod schemas with size/range limits and rejection of unknown keys. Zod is the single validation stack; `class-validator` and `class-transformer` were removed from the API in M0 and MUST NOT return as a divergent second path.
- Prisma parameterization is used; raw SQL is exceptional, reviewed, and parameterized.
- Markdown raw HTML is disabled. **MDX is never executed or compiled, at build time or at runtime**, per [ADR-004](DECISIONS.md#adr-004--markdown-with-an-allowlisted-directive-set-no-runtime-mdx-execution). An uploaded `.mdx` file is parsed as data and normalized to `.md`; imports, exports, JSX expressions, and unmapped components are rejected with a report.
- Rendering uses a schema-based HTML sanitizer as the **final** transform in the pipeline, so no later step can reintroduce unsafe output. Links reject `javascript:`, `data:` (except an explicit safe image policy), and unsafe protocols.
- Directives are a closed allowlist with validated attribute schemas ([CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) §9). No directive may emit a script, a style attribute, an event handler, or an unsandboxed iframe. An unknown directive is a write-time validation error, so it can never reach a reader.
- YAML frontmatter is parsed in safe mode: no custom tags, no arbitrary object construction, bounded document size, bounded nesting, and a bounded alias-expansion budget to prevent entity-expansion denial of service.
- **Import/export filenames and media identifiers are constructed server-side from validated identifiers only.** Traversal, absolute paths, symlinks, non-allowlisted locales, and unicode-normalization ambiguity are rejected.
- React output escaping remains enabled. `dangerouslySetInnerHTML` is prohibited except a reviewed JSON-LD serializer that escapes `<` and exactly one reviewed sanitized-content boundary. Both are covered by XSS-corpus tests.
- Markdown parsing, sanitizing, and highlighting happen server-side only. No parser or sanitizer is shipped to the browser, so client-side rendering cannot become a bypass.
- Appearance preferences are keys selecting static, authored CSS. **No stored value is ever interpolated into a `style` attribute, a `<style>` block, a CSS custom property, or a font URL.** This is what prevents the appearance feature from becoming a CSS injection vector.
- Locale is a closed allowlist. An unrecognized locale segment is a `404`, never a coercion, and never a path or query component.
- UI message-catalog values are escaped on output and never treated as HTML.
- User-entered outbound URLs are normalized and validated. Server-side URL fetches use fixed allowlisted hosts, DNS/IP checks, timeouts, response-size limits, and no arbitrary redirects to prevent SSRF.
- GitHub statistics use a request-time server adapter with a `SiteSettings` owner/repository allowlist, a fixed GitHub API origin, optional server-only authentication, timeout and response-size bounds, redirect refusal, validated fresh/stale caching, and bounded negative caching. The former browser hook is deleted, so visitor IPs no longer make third-party statistics requests. See [`M4-github-stats.md`](status/evidence/M4-github-stats.md).

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

- Remove public EmailJS credentials and send mail only from the API adapter. The browser integration is gone and `POST /api/v1/contact` is the only submission path; the provider-side key revocation is still outstanding, and until it happens the account remains usable by anyone holding a previously served bundle.
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
- Database URLs, session/CSRF keys, SMTP URLs, MinIO credentials, WebAuthn flows, and signed URLs are redacted from logs and error reports.
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
- Signed invalidation tests: forged signature, replayed nonce, stale timestamp, and body digest mismatch.
- Article transaction tests: invalid Markdown/reference, stale integer version, failed rendering, and forced transaction failure never change live output or create partial revisions/outbox entries.
- Publication tests: authenticated-only writes, owner-only lifecycle transitions, idempotent scheduling, revision history, and source-digest/render-integrity enforcement.
- appearance tests: tampered, oversized, and disabled-option cookie values fall back safely; no stored value reaches CSS; public responses do not send `Vary: Cookie`
- upload polyglot, spoofed MIME, oversized, traversal filename, malformed image/PDF tests, plus `.mdx` uploads containing imports, exports, JSX, and raw HTML
- injection and malformed pagination/filter property tests
- brute-force/rate-limit and proxy identity tests
- security header/CSP checks on public, admin, preview, file, and error responses
- dependency/secret/container scans with no unresolved critical findings and reviewed high findings
- encrypted backup plus successful isolated restore and object reconciliation
- manual owner recovery and incident-revocation drill

Use an established verification standard such as OWASP ASVS as the implementation checklist, and obtain an independent review before exposing the admin panel to the public internet.

## 16. PostgreSQL-native article security

[ADR-015](DECISIONS.md#adr-015--postgresql-native-article-authoring-and-publication) eliminates the write-capable GitHub App credential, public content webhook, protected content branch, and cross-store synchronization attack surface. PostgreSQL is the single authority for article source, metadata, publication state, and revision history.

### Authorization and mutation boundaries

- Do not expose article mutation endpoints until M6 authentication, session, CSRF, role, and recent-authentication controls are verified.
- Validate every authoring/import payload and existing taxonomy/media reference before persistence. Never accept rendered HTML, source digest, version increments, or publication authority from a browser.
- Use integer optimistic versions; stale writes return a bounded conflict response and cannot overwrite newer Markdown.
- Persist source, source SHA-256, sanitized render, version, revision/audit records, and cache-outbox intent in one PostgreSQL transaction. A failed transaction leaves all previous public state unchanged.

### Source and rendering integrity

- Normalize and bound Markdown input; reject executable MDX, unsafe HTML, unknown directives, unsafe URLs, malformed frontmatter, and unsupported locales.
- Compute SHA-256 from the authoritative normalized UTF-8 body on the server and bind rendered HTML to that digest and the current renderer version.
- Public reads fail closed for missing Markdown, invalid source hashes, stale renderers, unpublished/archived states, and locale mismatches. Raw Markdown, internal digests, versions, drafts, and revision snapshots never appear in public DTOs.
- Revision restore is a new authenticated validated transaction; immutable audit/revision history is never rewritten.

### Publication, availability, and recovery

- Exactly one logical scheduler holds the advisory lock; publication jobs and invalidation delivery use bounded leases, retries, and idempotency.
- Signed invalidations have independent secrets, bounded timestamps, nonce replay prevention, body digests, and constant-time signature checks.
- Public reads require no content provider, external content credential, or inbound webhook.
- Recovery verifies encrypted PostgreSQL article bodies/revisions together with referenced MinIO binaries, source digests, renderer integrity, and bilingual publication visibility.

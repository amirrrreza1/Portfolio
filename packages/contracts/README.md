# @portfolio/contracts

Zod schemas and inferred types shared by `apps/web` and `apps/api`.

One definition per rule, imported by both sides, so validation cannot drift
between what the browser checks and what the server enforces.

## Boundary

This package is imported by browser code. It must never import the database
client, a server secret, or anything Node-only. `test/boundaries.spec.ts`
enforces that as a real test rather than a convention, and is part of M1's exit
gate.

## Modules

| Import                            | Contents                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `@portfolio/contracts`            | Everything below                                                                |
| `@portfolio/contracts/common`     | IDs, locales, slugs, scalar values, pagination, errors                          |
| `@portfolio/contracts/appearance` | Theme and blog typography registry, preferences cookie, settings validation     |
| `@portfolio/contracts/auth`       | Password policy, login, WebAuthn, sessions, CSRF, recovery codes                |
| `@portfolio/contracts/content`    | Article frontmatter, SHA-256 source integrity, and optimistic version conflicts |
| `@portfolio/contracts/blog`       | The article lifecycle commands                                                  |

### `common`

- **`ids`** — branded resource IDs over UUID/CUID2, stable kebab-case keys, record versions, legacy IDs. The brands are compile-time only, so a `ProjectId` cannot be passed where a `PostId` is expected.
- **`locale`** — the closed `en`/`fa` allowlist, direction and font metadata, and the present/missing helpers the admin panel needs to distinguish a translation from an English fallback.
- **`slug`** — normalization per [ADR-010](../../docs/DECISIONS.md#adr-010--unicode-persian-slugs-are-canonical). One function shared by validation, storage, and lookup, because enforcing uniqueness over one form while querying another lets two colliding rows both insert.
- **`values`** — ISO dates and timestamps, `#rrggbb` colours, https and `mailto:` URLs, site-relative paths, trimmed and multi-line text, sort order, normalized email.
- **`pagination`** — cursor pagination with a server cap that rejects rather than silently clamping.
- **`errors`** — the stable error codes, their HTTP statuses, generic safe messages, and the success/list envelopes.

### `appearance`

- **`registry`** — theme keys, blog font registry, size steps, motion preferences. Every appearance value is a **key** that selects static authored CSS; no stored value is ever interpolated into CSS ([THEMING.md](../../docs/THEMING.md) §8).
- **`preferences`** — the `portfolio_prefs` cookie and `resolveAppearance`, which enforces that the visitor's choice wins over the configured default while the owner's allowlist wins over the visitor's request. The cookie is not `HttpOnly` and is therefore fully attacker-controlled; every field is revalidated on every request.
- **`settings`** — write validation for the `AppearanceSettings` singleton, including the invariant that is easiest to miss: at least one _script-compatible_ blog font must stay enabled per locale, or Persian articles render as boxes.

## Commands

```bash
pnpm --filter @portfolio/contracts build
pnpm --filter @portfolio/contracts typecheck
pnpm --filter @portfolio/contracts test
```

### `auth`

- **`credentials`** — password policy, login, owner provisioning, recovery codes. Length and breach checking, deliberately **not** composition rules: requiring an uppercase letter, a digit, and a symbol produces `Password1!`, which constrains the search space rather than expanding it. Passwords are NFC-normalized before length is measured, or the same passphrase typed with combining marks would hash differently and lock the user out.
- **`session`** — `__Host-` prefixed cookies, idle and absolute timeouts, the recent-auth window, CSRF, and the WebAuthn assertion shapes. No schema here carries a session token: a token in a response body is readable by any script that reaches the response, which is what `HttpOnly` exists to prevent.

### `content`

- **`frontmatter`** — the [CONTENT_PIPELINE.md](../../docs/CONTENT_PIPELINE.md) §3 contract. The single validation point the editor, validated Markdown import, and deterministic export share. `.strict()` matters more here than anywhere else: an unknown key means the file was written against a different contract, and silently dropping it is how an author's `draft: true` gets published because the real field is `status`.
- **`integrity`** — SHA-256 source digests and version-based conflict payloads. Published discovery requires valid authoritative Markdown and current renderer provenance.

### `blog`

- **`commands`** — save, autosave, preview, publish, schedule, unpublish, archive, and import. Editorial transitions are **commands, not status patches**: one `PATCH { status }` handler would have to infer from a diff whether it is publishing or withdrawing, and those have different preconditions, invalidation, audit events, and authorization.

## Still to come in M1

Nothing in this package. The remaining M1 slices are `packages/markdown` and the
MinIO media foundation.

/**
 * `@portfolio/contracts` — the Zod schemas and inferred types shared by the web
 * and API workspaces.
 *
 * One definition per rule, imported by both sides, so validation cannot drift
 * between what the browser checks and what the server enforces.
 *
 * This package is imported by browser code. It therefore must never import the
 * database client, a server secret, or anything with a Node-only dependency;
 * `test/boundaries.spec.ts` enforces that, and it is part of M1's exit gate.
 *
 * Modules:
 *
 * - `common` — IDs, locales, slugs, scalar values, pagination, errors
 * - `appearance` — theme, blog typography, motion, and the preferences cookie
 * - `auth` — credentials, password policy, sessions, CSRF, WebAuthn
 * - `content` — article frontmatter, source integrity, and invalidation
 * - `blog` — the article lifecycle commands
 */
export * from "./appearance/index.js";
export * from "./auth/index.js";
export * from "./blog/index.js";
export * from "./common/index.js";
export * from "./contact/index.js";
export * from "./content/index.js";
export * from "./portfolio/index.js";

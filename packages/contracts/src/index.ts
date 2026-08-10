/**
 * `@portfolio/contracts` — the Zod schemas and inferred types shared by the web
 * and API workspaces.
 *
 * One definition per rule, imported by both sides, so validation cannot drift
 * between what the browser checks and what the server enforces.
 *
 * This package is imported by browser code. It therefore must never import the
 * database client, a server secret, or anything with a Node-only dependency;
 * M1's exit gate tests that boundary explicitly.
 *
 * Delivered so far:
 *
 * - `common` — IDs, locales, slugs, scalar values, pagination, errors
 * - `appearance` — theme, blog typography, motion, and the preferences cookie
 *
 * Still to come in M1: `auth`, `content`, and the blog command schemas.
 */
export * from "./appearance/index.js";
export * from "./common/index.js";

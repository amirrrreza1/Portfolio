import { readFile } from "node:fs/promises";

import {
  ContentStoreValidationError,
  loadContentStoreRuntimeConfig,
  type ContentStoreRuntimeConfig,
} from "@portfolio/content-store";

/**
 * Whether this deployment has a content store at all.
 *
 * Three states, not two. "Nobody has provisioned the GitHub App yet" and
 * "somebody provisioned it wrongly" need different operator responses, and
 * collapsing them into a single boolean means the second one looks like the
 * first and nobody investigates.
 */
export type ContentRuntime =
  | { readonly state: "configured"; readonly config: ContentStoreRuntimeConfig }
  | { readonly state: "unconfigured" }
  | { readonly state: "invalid"; readonly reason: string };

const CONTENT_ENVIRONMENT_PREFIX = "CONTENT_GIT_";

/**
 * Resolves the content-store configuration without throwing.
 *
 * The API must boot without it. ADR-013 is explicit that Git reachability is
 * never a public-read dependency, and an unprovisioned content store is the
 * same class of thing: the blog index and every portfolio route are served from
 * PostgreSQL and do not care whether a commit can be written. Refusing to start
 * would take the whole public site down over a feature it does not use.
 */
export async function loadContentRuntime(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  readPrivateKey: (path: string) => Promise<string> = (path) =>
    readFile(path, "utf8")
): Promise<ContentRuntime> {
  const declared = Object.keys(environment).some(
    (key) =>
      key.startsWith(CONTENT_ENVIRONMENT_PREFIX) &&
      (environment[key]?.trim().length ?? 0) > 0
  );
  if (!declared) return { state: "unconfigured" };

  try {
    return {
      state: "configured",
      config: await loadContentStoreRuntimeConfig({
        environment,
        readPrivateKey,
      }),
    };
  } catch (error) {
    // Validation messages name variables, never values, so they are safe to
    // surface. Anything else is reported without its message, because an
    // arbitrary failure here is usually a filesystem error whose text contains
    // the private key's path.
    return {
      state: "invalid",
      reason:
        error instanceof ContentStoreValidationError
          ? error.message
          : "The content store configuration could not be loaded.",
    };
  }
}

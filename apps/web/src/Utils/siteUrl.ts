/**
 * Resolves the absolute public origin used to build canonical and Open Graph
 * URLs.
 *
 * Server-only by construction: `PUBLIC_SITE_URL` carries no `NEXT_PUBLIC_`
 * prefix, so Next.js never inlines it into a client bundle. The enforced
 * package boundary that makes this a build error rather than a convention is an
 * M1 deliverable.
 *
 * `metadataBase` must be absolute: without it, Next.js resolves every relative
 * metadata URL against `localhost`, which silently ships wrong canonicals and
 * broken social previews to production. Guessing a default would hide that, so
 * this throws in production instead and falls back only in development.
 *
 * Full runtime configuration validation arrives in M1 (IMPLEMENTATION_PLAN.md
 * Phase 1, step 5); this is the narrow version M0 needs.
 */
const DEVELOPMENT_FALLBACK = "http://localhost:3000";

export function getSiteUrl(): URL {
  const configured = process.env.PUBLIC_SITE_URL?.trim();

  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PUBLIC_SITE_URL is required in production. It is the metadataBase for every canonical and Open Graph URL; see .env.example."
      );
    }

    return new URL(DEVELOPMENT_FALLBACK);
  }

  let parsed: URL;

  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(
      `PUBLIC_SITE_URL must be an absolute URL including the scheme, received "${configured}".`
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `PUBLIC_SITE_URL must use http or https, received "${parsed.protocol}".`
    );
  }

  return parsed;
}

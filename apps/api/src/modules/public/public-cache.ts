import { createHash } from "node:crypto";

export const PUBLIC_SHORT_CACHE_CONTROL =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";
export const PUBLIC_LONG_CACHE_CONTROL =
  "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

export function createPublicEtag(value: unknown): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(value))
    .digest("base64url");
  return `"${digest}"`;
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Emit a self-contained server bundle with only the traced production
   * dependencies. This is what the multi-stage, non-root runtime image in
   * docs/DOCKER.md copies; without it the image would need the full
   * `node_modules` tree, which is both larger and a wider attack surface.
   *
   * Set in M0 rather than M9 so the container work never has to discover that
   * the build output shape was wrong all along.
   */
  output: "standalone",

  /**
   * The workspace root is the monorepo root, not `apps/web`. Next.js infers
   * this from the nearest lockfile and warns when the inference is ambiguous in
   * a pnpm workspace, so state it.
   */
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,

  /**
   * `poweredByHeader` leaks the framework for no benefit. The full security
   * header and CSP policy lands in M5 (ROADMAP.md §6); this is the part that
   * costs nothing now.
   */
  poweredByHeader: false,
};

export default nextConfig;

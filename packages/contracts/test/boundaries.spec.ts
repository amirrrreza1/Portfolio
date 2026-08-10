import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const sourceRoot = path.join(packageRoot, "src");

/**
 * `@portfolio/contracts` is imported by browser code.
 *
 * M1's exit gate requires that public and browser packages cannot import the
 * database client or server secrets. This is the cheap half of that check: a
 * lint over what this package actually imports. It catches the mistake at the
 * moment it is made, rather than when a bundle turns out to contain Prisma or
 * a Next.js build fails with an opaque resolution error.
 */
const FORBIDDEN_IMPORTS = [
  "@portfolio/database",
  "@prisma/client",
  "prisma",
  "pg",
  "argon2",
  "nodemailer",
  "@aws-sdk/client-s3",
  "@nestjs/common",
  "fastify",
  "node:fs",
  "node:crypto",
  "node:process",
  "node:child_process",
];

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(absolute)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(absolute);
    }
  }

  return files;
}

const IMPORT_PATTERN =
  /(?:^|\n)\s*(?:import|export)[^;]*?from\s+["']([^"']+)["']/g;

describe("package boundaries", () => {
  it("imports nothing server-only", async () => {
    const files = await collectSourceFiles(sourceRoot);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const file of files) {
      const contents = await readFile(file, "utf8");

      for (const match of contents.matchAll(IMPORT_PATTERN)) {
        const specifier = match[1];
        if (specifier === undefined) continue;

        const forbidden = FORBIDDEN_IMPORTS.find(
          (name) => specifier === name || specifier.startsWith(`${name}/`)
        );

        if (forbidden !== undefined) {
          violations.push(
            `${path.relative(packageRoot, file)} imports "${specifier}"`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("uses explicit .js extensions on relative imports", async () => {
    // NodeNext module resolution requires them. Omitting one builds fine under
    // a bundler and fails only at runtime in the API, which is the worst place
    // to discover it.
    const files = await collectSourceFiles(sourceRoot);
    const violations: string[] = [];

    for (const file of files) {
      const contents = await readFile(file, "utf8");

      for (const match of contents.matchAll(IMPORT_PATTERN)) {
        const specifier = match[1];
        if (specifier === undefined) continue;
        if (!specifier.startsWith(".")) continue;
        if (specifier.endsWith(".js")) continue;

        violations.push(
          `${path.relative(packageRoot, file)} imports "${specifier}"`
        );
      }
    }

    expect(violations).toEqual([]);
  });
});

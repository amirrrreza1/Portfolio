import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const sourceRoot = path.join(packageRoot, "src");

const FORBIDDEN_DATABASE_IMPORTS = [
  "@portfolio/database",
  "@prisma/client",
  "prisma",
  "pg",
] as const;

const SAFE_CLIENT_ENV_NAMES = new Set(["NODE_ENV"]);

type SourceModule = {
  readonly contents: string;
  readonly imports: readonly string[];
};

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(absolute)));
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(absolute);
    }
  }

  return files;
}

function collectImports(contents: string): string[] {
  const imports = new Set<string>();
  const staticImportPattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportPattern = /import\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const pattern of [staticImportPattern, dynamicImportPattern]) {
    for (const match of contents.matchAll(pattern)) {
      if (match[1] !== undefined) imports.add(match[1]);
    }
  }

  return [...imports];
}

function isForbiddenDatabaseImport(specifier: string): boolean {
  return FORBIDDEN_DATABASE_IMPORTS.some(
    (name) => specifier === name || specifier.startsWith(`${name}/`)
  );
}

function resolveSourceImport(
  importer: string,
  specifier: string,
  sourceFiles: ReadonlySet<string>
): string | undefined {
  let unresolved: string;

  if (specifier.startsWith("@/")) {
    unresolved = path.join(sourceRoot, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    unresolved = path.resolve(path.dirname(importer), specifier);
  } else {
    return undefined;
  }

  const withoutJavaScriptExtension = unresolved.replace(/\.js$/, "");
  const candidates = [
    unresolved,
    `${withoutJavaScriptExtension}.ts`,
    `${withoutJavaScriptExtension}.tsx`,
    path.join(unresolved, "index.ts"),
    path.join(unresolved, "index.tsx"),
  ];

  return candidates.find((candidate) => sourceFiles.has(candidate));
}

function isClientEntry(contents: string): boolean {
  return /^\s*["']use client["'];/u.test(contents);
}

function collectEnvironmentNames(contents: string): string[] {
  const names = new Set<string>();
  const environmentPattern =
    /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[\s*["']([^"']+)["']\s*\])/g;

  for (const match of contents.matchAll(environmentPattern)) {
    const name = match[1] ?? match[2];
    if (name !== undefined) names.add(name);
  }

  return [...names];
}

describe("web server boundary", () => {
  it("confines every legacy JSON import to the rollback adapter", async () => {
    const sourceFiles = await collectSourceFiles(sourceRoot);
    const importers: string[] = [];

    for (const file of sourceFiles) {
      const contents = await readFile(file, "utf8");
      if (
        collectImports(contents).some((specifier) =>
          specifier.startsWith("@/DataBase/")
        )
      ) {
        importers.push(path.relative(packageRoot, file).replaceAll("\\", "/"));
      }
    }

    expect(importers).toEqual(["src/server/legacy-portfolio.ts"]);
  });

  it("keeps database clients out of the web package", async () => {
    const sourceFiles = await collectSourceFiles(sourceRoot);
    const violations: string[] = [];

    for (const file of sourceFiles) {
      const contents = await readFile(file, "utf8");
      for (const specifier of collectImports(contents)) {
        if (isForbiddenDatabaseImport(specifier)) {
          violations.push(
            `${path.relative(packageRoot, file)} imports "${specifier}"`
          );
        }
      }
    }

    const manifest = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8")
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    for (const section of ["dependencies", "devDependencies"] as const) {
      for (const dependency of Object.keys(manifest[section] ?? {})) {
        if (isForbiddenDatabaseImport(dependency)) {
          violations.push(`package.json ${section} includes "${dependency}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps server-only modules and secrets out of the client graph", async () => {
    const sourceFiles = await collectSourceFiles(sourceRoot);
    const sourceFileSet = new Set(sourceFiles);
    const modules = new Map<string, SourceModule>();

    for (const file of sourceFiles) {
      const contents = await readFile(file, "utf8");
      modules.set(file, { contents, imports: collectImports(contents) });
    }

    const queue = sourceFiles.filter((file) =>
      isClientEntry(modules.get(file)?.contents ?? "")
    );
    const clientGraph = new Set<string>();

    while (queue.length > 0) {
      const file = queue.shift();
      if (file === undefined || clientGraph.has(file)) continue;

      clientGraph.add(file);
      const sourceModule = modules.get(file);
      if (sourceModule === undefined) continue;

      for (const specifier of sourceModule.imports) {
        const dependency = resolveSourceImport(file, specifier, sourceFileSet);
        if (dependency !== undefined && !clientGraph.has(dependency)) {
          queue.push(dependency);
        }
      }
    }

    expect(clientGraph.size).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of clientGraph) {
      const sourceModule = modules.get(file);
      if (sourceModule === undefined) continue;
      const relativeFile = path.relative(packageRoot, file);

      if (sourceModule.imports.includes("server-only")) {
        violations.push(`${relativeFile} imports "server-only"`);
      }

      for (const specifier of sourceModule.imports) {
        if (isForbiddenDatabaseImport(specifier)) {
          violations.push(`${relativeFile} imports "${specifier}"`);
        }
      }

      for (const name of collectEnvironmentNames(sourceModule.contents)) {
        if (
          !name.startsWith("NEXT_PUBLIC_") &&
          !SAFE_CLIENT_ENV_NAMES.has(name)
        ) {
          violations.push(
            `${relativeFile} reads server environment variable ${name}`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

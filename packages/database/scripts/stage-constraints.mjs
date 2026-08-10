/**
 * Copies the integrity constraints into the migration Prisma just created with
 * `--create-only`.
 *
 * This exists because the alternative is a manual copy, and forgetting it does
 * not fail: `prisma migrate dev` happily applies an empty migration, records it
 * as applied, and leaves the database with no constraints at all. The failure
 * would surface much later as data that should have been impossible.
 *
 * Usage: node scripts/stage-constraints.mjs
 */

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const migrationsDir = path.join(packageRoot, "prisma", "migrations");
const sourcePath = path.join(
  packageRoot,
  "prisma",
  "sql",
  "integrity_constraints.sql"
);

const entries = await readdir(migrationsDir, { withFileTypes: true });

const candidates = entries
  .filter(
    (entry) =>
      entry.isDirectory() && entry.name.endsWith("_integrity_constraints")
  )
  .map((entry) => entry.name)
  .sort();

const target = candidates.at(-1);

if (target === undefined) {
  console.error(
    "No *_integrity_constraints migration directory found.\n" +
      "Create one first:\n" +
      "  prisma migrate dev --create-only --name integrity_constraints"
  );
  process.exit(1);
}

const migrationFile = path.join(migrationsDir, target, "migration.sql");
const existing = await readFile(migrationFile, "utf8").catch(() => "");

if (existing.includes("integrity_constraints")) {
  console.log(`${target}/migration.sql already staged; nothing to do.`);
  process.exit(0);
}

if (existing.trim().length > 0) {
  // Prisma generates an empty file for --create-only. Anything else means this
  // migration already has content, and overwriting it would destroy work.
  console.error(
    `${target}/migration.sql is not empty. Refusing to overwrite it.\n` +
      "Create a fresh --create-only migration, or apply the SQL by hand."
  );
  process.exit(1);
}

const sql = await readFile(sourcePath, "utf8");
const header = `-- Staged from prisma/sql/integrity_constraints.sql by\n-- scripts/stage-constraints.mjs. Edit the source file, not this copy.\n\n`;

await writeFile(migrationFile, header + sql, "utf8");

const { size } = await stat(migrationFile);
console.log(`Staged ${size} bytes into ${target}/migration.sql`);
console.log("Now run: prisma migrate dev");

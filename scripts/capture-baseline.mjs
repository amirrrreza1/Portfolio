/**
 * M0 legacy baseline capture.
 *
 * Records the legacy public routes, JSON content counts, and a SHA-256 hash of
 * every legacy source and asset file BEFORE Phase 0 stabilization corrects any
 * source path or removes any redundant font file.
 *
 * The output is deterministic: paths are POSIX-normalized and sorted, so a
 * re-run on an unchanged checkout produces a byte-identical report. That is what
 * makes it usable as evidence during the M2 migration reconciliation.
 *
 * The committed report is FROZEN. It is generated once, before stabilization,
 * and is never refreshed to match `main` — a baseline that tracks the current
 * checkout records nothing. CI therefore does not drift-check it. The counts
 * that must not change silently are asserted in
 * `apps/web/test/legacy-assets.spec.ts` instead.
 *
 * Usage: node scripts/capture-baseline.mjs [--check]
 *   (no flag)  write docs/BASELINE_M0.md
 *   --check    verify the committed report against the current checkout. Only
 *              meaningful when run from the pre-stabilization commit; expect it
 *              to report drift on any later commit, by design.
 */

import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const webRoot = path.join(repoRoot, "apps", "web");
const reportPath = path.join(repoRoot, "docs", "BASELINE_M0.md");

/** Trees whose every file is hashed, relative to apps/web. */
const HASHED_TREES = ["src", "public"];

/** Never descend into these; they are build output or dependencies. */
const IGNORED_DIRECTORIES = new Set([".next", "node_modules", ".git", "dist"]);

const toPosix = (value) => value.split(path.sep).join("/");

async function collectFiles(absoluteDirectory, relativeBase) {
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;

    const absolute = path.join(absoluteDirectory, entry.name);
    const relative = toPosix(path.join(relativeBase, entry.name));

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolute, relative)));
    } else if (entry.isFile()) {
      files.push({ absolute, relative });
    }
  }

  return files;
}

async function describeFile(file) {
  const [contents, stats] = await Promise.all([
    readFile(file.absolute),
    stat(file.absolute),
  ]);

  return {
    path: file.relative,
    bytes: stats.size,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(webRoot, relativePath), "utf8"));
}

/**
 * The legacy route table. Next.js route groups such as `(Home Page)` do not
 * appear in the URL, so the mapping from file to URL is recorded explicitly
 * rather than derived; every one of these must still resolve after the M4
 * locale-prefixed cutover, via exactly one 308 redirect.
 */
const LEGACY_ROUTES = [
  { url: "/", source: "src/app/(Home Page)/page.tsx", rendering: "static" },
  {
    url: "/projects",
    source: "src/app/(Other Pages)/projects/page.tsx",
    rendering: "static",
  },
  { url: "*", source: "src/app/not-found.tsx", rendering: "404 handler" },
];

async function buildReport() {
  const described = [];

  for (const tree of HASHED_TREES) {
    const files = await collectFiles(path.join(webRoot, tree), tree);
    for (const file of files) {
      described.push(await describeFile(file));
    }
  }

  described.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const [projects, skills, certificates, quotes] = await Promise.all([
    readJson("src/DataBase/Projects.json"),
    readJson("src/DataBase/Skills.json"),
    readJson("src/DataBase/Certificate.json"),
    readJson("src/DataBase/DailyQuote.json"),
  ]);

  // A missing `items` array means the legacy shape changed. Fail loudly: a
  // baseline that silently reports zero skills is worse than no baseline,
  // because M2 would reconcile against it and pass.
  const skillCount = skills.reduce((total, category) => {
    if (!Array.isArray(category.items)) {
      throw new Error(
        `Skills.json category ${category.id} has no \`items\` array; the legacy shape changed and this script must be updated before the baseline can be trusted.`
      );
    }
    return total + category.items.length;
  }, 0);

  const fontsByExtension = new Map();
  for (const file of described) {
    if (!file.path.startsWith("public/Fonts/")) continue;
    const extension = path.extname(file.path).slice(1);
    fontsByExtension.set(extension, (fontsByExtension.get(extension) ?? 0) + 1);
  }

  const totalBytes = described.reduce((total, file) => total + file.bytes, 0);
  const manifestDigest = createHash("sha256")
    .update(described.map((file) => `${file.sha256}  ${file.path}`).join("\n"))
    .digest("hex");

  const lines = [];
  const write = (line = "") => lines.push(line);

  write("# M0 legacy baseline");
  write();
  write(
    "Generated once by `node scripts/capture-baseline.mjs`, before Phase 0 stabilization. **Frozen: do not edit and do not regenerate.** Refreshing this file to match the current checkout would erase the only record it exists to keep."
  );
  write();
  write(
    "This is the pre-stabilization record of the legacy portfolio required by [ROADMAP.md](ROADMAP.md) §6 (M0) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) Phase 0. It is captured *before* the certificate path casing is corrected and *before* redundant font formats are deleted, so that every later change can be proved intentional rather than accidental."
  );
  write();
  write(
    "It is also the input to the M2 reconciliation in [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md) §15: migrated output is compared against these counts and hashes, not against a re-read of a source that may have drifted."
  );
  write();
  write("## 1. Capture identity");
  write();
  write("| Field | Value |");
  write("| --- | --- |");
  write(`| Files hashed | ${described.length} |`);
  write(`| Total bytes | ${totalBytes.toLocaleString("en-US")} |`);
  write(`| Manifest digest (SHA-256 of §4) | \`${manifestDigest}\` |`);
  write(
    `| Hashed trees | ${HASHED_TREES.map((t) => `apps/web/${t}`).join(", ")} |`
  );
  write();
  write(
    'The manifest digest is the single value to compare when asking "has the legacy source changed?". It covers §4 in full.'
  );
  write();
  write("## 2. Legacy routes");
  write();
  write(
    "Route groups in parentheses do not appear in the URL. Every URL below must still resolve after the M4 cutover through exactly one `308` redirect to its locale-prefixed equivalent."
  );
  write();
  write("| URL | Source | Rendering |");
  write("| --- | --- | --- |");
  for (const route of LEGACY_ROUTES) {
    write(
      `| \`${route.url}\` | \`apps/web/${route.source}\` | ${route.rendering} |`
    );
  }
  write();
  write("## 3. Legacy content counts");
  write();
  write(
    "These are the authoritative pre-migration counts. M2 must reconcile against them exactly; a mismatch is a migration defect, not a rounding difference."
  );
  write();
  write("| Source | Records |");
  write("| --- | --- |");
  write(`| \`src/DataBase/Projects.json\` | ${projects.length} projects |`);
  write(
    `| \`src/DataBase/Skills.json\` | ${skills.length} categories, ${skillCount} skills |`
  );
  write(
    `| \`src/DataBase/Certificate.json\` | ${certificates.length} certificates |`
  );
  write(`| \`src/DataBase/DailyQuote.json\` | ${quotes.length} quotes |`);
  write();
  write("### Font files at capture time");
  write();
  write("| Format | Files |");
  write("| --- | --- |");
  for (const extension of [...fontsByExtension.keys()].sort()) {
    write(`| \`.${extension}\` | ${fontsByExtension.get(extension)} |`);
  }
  write();
  write(
    "Phase 0 stabilization keeps the `woff2` set and deletes the rest. The hashes in §4 are the record of what was removed."
  );
  write();
  write("## 4. File manifest");
  write();
  write("| Path (relative to `apps/web/`) | Bytes | SHA-256 |");
  write("| --- | --- | --- |");
  for (const file of described) {
    write(`| \`${file.path}\` | ${file.bytes} | \`${file.sha256}\` |`);
  }
  write();

  return lines.join("\n");
}

const report = await buildReport();

if (process.argv.includes("--check")) {
  const existing = await readFile(reportPath, "utf8").catch(() => null);
  if (existing !== report) {
    console.error(
      "docs/BASELINE_M0.md is out of date. Run `node scripts/capture-baseline.mjs`."
    );
    process.exit(1);
  }
  console.log("Baseline report is current.");
} else {
  await writeFile(reportPath, report, "utf8");
  console.log(`Wrote ${path.relative(repoRoot, reportPath)}`);
}

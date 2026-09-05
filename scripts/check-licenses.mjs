import { spawnSync } from "node:child_process";

const approved = new Set([
  "0BSD",
  "Apache-2.0",
  "Apache-2.0 AND LGPL-3.0-or-later",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "EPL-2.0",
  "ISC",
  "MIT",
  "MIT and ISC",
  "MIT-0",
  "Python-2.0",
  "Standard 'no charge' license: https://gsap.com/standard-license.",
  "Unlicense",
]);

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("pnpm CLI path is unavailable.");
const result = spawnSync(
  process.execPath,
  [pnpmCli, "licenses", "list", "--prod", "--json"],
  {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const report = JSON.parse(result.stdout);
// pnpm's injected-workspace deployment mode reports private first-party
// packages as `Unknown`; they are repository source, not third-party license
// intake. Keep the gate focused on shipped external dependencies.
const reviewedReport = Object.fromEntries(
  Object.entries(report)
    .map(([license, entries]) => [
      license,
      entries.filter(({ name }) => !name.startsWith("@portfolio/")),
    ])
    .filter(([, entries]) => entries.length > 0)
);
const found = Object.keys(reviewedReport);
const unapproved = found.filter((license) => !approved.has(license));
if (unapproved.length > 0) {
  console.error(`Unreviewed production licenses: ${unapproved.join(", ")}`);
  process.exit(1);
}
const packages = Object.values(reviewedReport).reduce(
  (count, entries) => count + entries.length,
  0
);
console.log(
  `Reviewed ${packages} production packages across ${found.length} license expressions.`
);

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertMigrationReady,
  planLegacyMigration,
  type LegacySnapshot,
} from "./index.js";
import { serializeReconciliationReport } from "./report.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const output =
  process.argv[2] ?? path.join(root, "migration-reconciliation.json");
const sourceDirectory = path.join(root, "apps", "web", "src", "DataBase");

async function readJson(name: string): Promise<unknown> {
  const source = await readFile(path.join(sourceDirectory, name), "utf8");
  return JSON.parse(source);
}

function array(value: unknown, file: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(file + " must contain a JSON array.");
  }
  return value;
}

const snapshot: LegacySnapshot = {
  projects: array(
    await readJson("Projects.json"),
    "Projects.json"
  ) as LegacySnapshot["projects"],
  skills: array(
    await readJson("Skills.json"),
    "Skills.json"
  ) as LegacySnapshot["skills"],
  certificates: array(
    await readJson("Certificate.json"),
    "Certificate.json"
  ) as LegacySnapshot["certificates"],
  quotes: array(
    await readJson("DailyQuote.json"),
    "DailyQuote.json"
  ) as LegacySnapshot["quotes"],
};

const plan = planLegacyMigration(snapshot);
await writeFile(output, serializeReconciliationReport(plan), "utf8");
console.log("Wrote reconciliation report to " + output + ".");
console.log(
  "Preflight: " +
    plan.issues.filter((issue) => issue.severity === "error").length +
    " error(s), " +
    plan.issues.filter((issue) => issue.severity === "warning").length +
    " warning(s)."
);
assertMigrationReady(plan);

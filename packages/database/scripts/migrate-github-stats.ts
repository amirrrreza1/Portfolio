import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnvironment } from "dotenv";
import {
  applyLegacyGitHubStatsMigration,
  assertLegacyGitHubStatsMigrationReady,
  planLegacyGitHubStatsMigration,
  type LegacyGitHubStatsSnapshot,
} from "@portfolio/migration";

import {
  createDatabaseClient,
  createLegacyGitHubStatsMigrationStore,
} from "../src/index.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
loadEnvironment({ path: path.join(root, ".env"), quiet: true });

if (!process.argv.slice(2).includes("--apply")) {
  throw new Error(
    "Refusing to migrate GitHub statistics settings without --apply."
  );
}

const snapshot = await readSnapshot();
const plan = planLegacyGitHubStatsMigration(snapshot);
const reportPath = path.join(
  root,
  "docs",
  "status",
  "evidence",
  "M4-github-stats-reconciliation.json"
);
await writeFile(
  reportPath,
  JSON.stringify(
    {
      migrationVersion: plan.version,
      sourceChecksum: plan.sourceChecksum,
      username: plan.username,
      repositoryAllowlist: plan.repositoryAllowlist,
      cacheTtlSeconds: plan.cacheTtlSeconds,
      errors: plan.issues,
    },
    null,
    2
  ) + "\n",
  "utf8"
);
assertLegacyGitHubStatsMigrationReady(plan);

const database = createDatabaseClient({
  connectionString: requiredEnvironment("DATABASE_URL"),
});
try {
  const result = await applyLegacyGitHubStatsMigration(
    createLegacyGitHubStatsMigrationStore(database),
    snapshot
  );
  console.log(
    result.applied
      ? "Legacy GitHub statistics settings migrated."
      : "Legacy GitHub statistics settings already applied."
  );
  console.log("GitHub-statistics report: " + reportPath);
} finally {
  await database.$disconnect();
}

async function readSnapshot(): Promise<LegacyGitHubStatsSnapshot> {
  const value = JSON.parse(
    await readFile(
      path.join(root, "apps", "web", "src", "DataBase", "Projects.json"),
      "utf8"
    )
  ) as unknown;
  if (!Array.isArray(value)) {
    throw new Error("Projects.json must contain an array.");
  }
  const repositoryUrls = value.map((project, index) => {
    if (typeof project !== "object" || project === null) {
      throw new Error(`Projects.json[${index}] must be an object.`);
    }
    const repository = (project as { readonly repo?: unknown }).repo;
    if (repository === undefined || repository === null) return null;
    if (typeof repository !== "string") {
      throw new Error(`Projects.json[${index}].repo must be text or null.`);
    }
    return repository;
  });
  return {
    username: "amirrrreza1",
    repositoryUrls,
    cacheTtlSeconds: 3_600,
  };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith("replace_") || value.includes("change_me")) {
    throw new Error(name + " must be set to a non-placeholder value.");
  }
  return value;
}

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnvironment } from "dotenv";

import {
  executeLegacyMediaMigration,
  planLegacyMigration,
  serializeReconciliationReport,
  type LegacySnapshot,
} from "@portfolio/migration";
import {
  createS3MediaObjectStore,
  LocalMediaObjectStore,
  type MediaObjectStore,
} from "@portfolio/media";

import {
  createDatabaseClient,
  createLegacyMigrationStore,
} from "../src/index.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
loadEnvironment({ path: path.join(root, ".env"), quiet: true });

const args = new Set(process.argv.slice(2));
if (!args.has("--apply")) {
  throw new Error("Refusing to migrate without the explicit --apply flag.");
}
const sourceDirectory = path.join(root, "apps", "web", "src", "DataBase");
const publicDirectory = path.join(root, "apps", "web", "public");
const reportPath = path.join(root, "migration-reconciliation.json");
const localRoot = readOption("--local-media-root");
const snapshot = await readSnapshot();
const plan = planLegacyMigration(snapshot);
await writeFile(reportPath, serializeReconciliationReport(plan), "utf8");

if (plan.issues.some((issue) => issue.severity === "error")) {
  throw new Error("Preflight failed; see " + reportPath + ".");
}
const databaseUrl = requiredEnvironment("DATABASE_URL");
const objectStore = localRoot
  ? new LocalMediaObjectStore(path.resolve(root, localRoot))
  : minioObjectStore();
const database = createDatabaseClient({ connectionString: databaseUrl });

try {
  const result = await executeLegacyMediaMigration({
    snapshot,
    store: createLegacyMigrationStore(database),
    objectStore,
    readLegacyFile,
    maxDocumentBytes: 10 * 1024 * 1024,
  });
  console.log(
    result.skipped
      ? "Legacy migration already applied; no media objects were written."
      : "Legacy migration applied with " +
          result.uploadedCount +
          " media object(s)."
  );
  console.log("Reconciliation report: " + reportPath);
} finally {
  await database.$disconnect();
}

async function readSnapshot(): Promise<LegacySnapshot> {
  return {
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
}

async function readJson(name: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(sourceDirectory, name), "utf8"));
}

function array(value: unknown, file: string): readonly unknown[] {
  if (!Array.isArray(value))
    throw new Error(file + " must contain a JSON array.");
  return value;
}

async function readLegacyFile(sourcePath: string): Promise<Uint8Array> {
  if (!sourcePath.startsWith("/") || sourcePath.includes("\\")) {
    throw new Error("Invalid legacy media path: " + sourcePath);
  }
  const target = path.resolve(publicDirectory, "." + sourcePath);
  if (!target.startsWith(publicDirectory + path.sep)) {
    throw new Error("Legacy media path escapes the public directory.");
  }
  return readFile(target);
}

function minioObjectStore(): MediaObjectStore {
  return createS3MediaObjectStore({
    endpoint: requiredEnvironment("MINIO_ENDPOINT"),
    region: requiredEnvironment("MINIO_REGION"),
    bucket: requiredEnvironment("MINIO_BUCKET"),
    accessKeyId: requiredEnvironment("MINIO_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvironment("MINIO_SECRET_ACCESS_KEY"),
    forcePathStyle: process.env.MINIO_FORCE_PATH_STYLE !== "false",
  });
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith("replace_") || value.includes("change_me")) {
    throw new Error(name + " must be set to a non-placeholder value.");
  }
  return value;
}

function readOption(name: string): string | undefined {
  const values = process.argv.slice(2);
  const index = values.indexOf(name);
  if (index === -1) return undefined;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(name + " requires a directory value.");
  }
  return value;
}

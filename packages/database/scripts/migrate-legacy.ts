import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnvironment } from "dotenv";

import {
  applyLegacyPageSectionMigration,
  applyLegacySkillColorMigration,
  executeLegacyMediaMigration,
  planLegacyMigration,
  planLegacyPageSectionMigration,
  planLegacySkillColorMigration,
  serializeReconciliationReport,
  serializeSkillColorPlan,
  type LegacyPageSectionSnapshot,
  type LegacySkillColorSnapshot,
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
  createLegacyPageSectionMigrationStore,
  createLegacySkillColorMigrationStore,
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
const reportPath = path.join(
  root,
  "docs",
  "status",
  "evidence",
  "M2-reconciliation.json"
);
const pageSectionReportPath = path.join(
  root,
  "docs",
  "status",
  "evidence",
  "M2-page-sections-reconciliation.json"
);
const skillColorReportPath = path.join(
  root,
  "docs",
  "status",
  "evidence",
  "M2-skill-colors-reconciliation.json"
);
const localRoot = readOption("--local-media-root");
const snapshot = await readSnapshot();
const plan = planLegacyMigration(snapshot);
await writeFile(reportPath, serializeReconciliationReport(plan), "utf8");
const pageSectionSnapshot = await readPageSectionSnapshot();
const pageSectionPlan = planLegacyPageSectionMigration(pageSectionSnapshot);
await writeFile(
  pageSectionReportPath,
  JSON.stringify(
    {
      migrationVersion: pageSectionPlan.version,
      sourceChecksum: pageSectionPlan.sourceChecksum,
      birthDateConfigured: pageSectionPlan.birthDateConfigured,
      sectionKeys: pageSectionPlan.sectionKeys,
      errors: pageSectionPlan.issues,
    },
    null,
    2
  ) + "\n",
  "utf8"
);
const skillColorSnapshot: LegacySkillColorSnapshot = {
  categories: snapshot.skills.map((category) => ({
    id: category.id,
    items: category.items.map((skill) => ({
      id: skill.id,
      color: skill.color,
    })),
  })),
};
const skillColorPlan = planLegacySkillColorMigration(skillColorSnapshot);
await writeFile(
  skillColorReportPath,
  JSON.stringify(serializeSkillColorPlan(skillColorPlan), null, 2) + "\n",
  "utf8"
);
if (
  plan.issues.some((issue) => issue.severity === "error") ||
  pageSectionPlan.issues.length > 0 ||
  skillColorPlan.issues.length > 0
) {
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
  const sectionResult = await applyLegacyPageSectionMigration(
    createLegacyPageSectionMigrationStore(database),
    pageSectionSnapshot
  );
  console.log(
    sectionResult.applied
      ? "Legacy Hero/About and section ordering migrated."
      : "Legacy Hero/About and section ordering already applied."
  );
  const skillColorResult = await applyLegacySkillColorMigration(
    createLegacySkillColorMigrationStore(database),
    skillColorSnapshot
  );
  console.log(
    skillColorResult.applied
      ? "Reviewed skill colours applied to " +
          skillColorResult.plan.replacements.length +
          " skill(s); the frozen source is unchanged."
      : "Reviewed skill colours already applied."
  );
  console.log("Reconciliation report: " + reportPath);
  console.log("Page-section report: " + pageSectionReportPath);
  console.log("Skill-colour report: " + skillColorReportPath);
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

async function readPageSectionSnapshot(): Promise<LegacyPageSectionSnapshot> {
  const value = await readJson("PageSections.json");
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("PageSections.json must contain an object.");
  }
  const sections = (value as { readonly sections?: unknown }).sections;
  if (!Array.isArray(sections)) {
    throw new Error("PageSections.json.sections must contain an array.");
  }
  return {
    birthDate: process.env.BIRTH_DATE?.trim() || null,
    sections: sections as unknown as LegacyPageSectionSnapshot["sections"],
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

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertMigrationReady,
  planLegacyMigration,
  type LegacySnapshot,
} from "../src/index.js";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const legacyDirectory = path.join(workspaceRoot, "apps/web/src/DataBase");

async function readSnapshot(): Promise<LegacySnapshot> {
  const readJson = async (name: string) =>
    JSON.parse(
      await readFile(path.join(legacyDirectory, name), "utf8")
    ) as unknown;

  return {
    projects: (await readJson("Projects.json")) as LegacySnapshot["projects"],
    skills: (await readJson("Skills.json")) as LegacySnapshot["skills"],
    certificates: (await readJson(
      "Certificate.json"
    )) as LegacySnapshot["certificates"],
    quotes: (await readJson("DailyQuote.json")) as LegacySnapshot["quotes"],
  };
}

describe("preserved legacy snapshot", () => {
  it("has a migration-ready structure with every intended warning reported", async () => {
    const plan = planLegacyMigration(await readSnapshot());

    expect(plan.counts).toEqual({
      projects: 14,
      skillCategories: 6,
      skills: 26,
      certificates: 5,
      quotes: 35,
    });
    expect(plan.issues.filter((issue) => issue.severity === "error")).toEqual(
      []
    );
    expect(plan.issues.map((issue) => issue.code)).toContain(
      "PLACEHOLDER_URL_REMOVED"
    );
    expect(plan.issues.map((issue) => issue.code)).toContain(
      "LOW_CONTRAST_SKILL_COLOR"
    );
    expect(() => assertMigrationReady(plan)).not.toThrow();
  });
});

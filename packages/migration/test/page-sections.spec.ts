import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  applyLegacyPageSectionMigration,
  assertLegacyPageSectionMigrationReady,
  planLegacyPageSectionMigration,
  type LegacyPageSectionMigrationStore,
  type LegacyPageSectionSnapshot,
} from "../src/index.js";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

async function snapshot(
  birthDate: string | null = "2000-01-01"
): Promise<LegacyPageSectionSnapshot> {
  const value = JSON.parse(
    await readFile(
      path.join(workspaceRoot, "apps/web/src/DataBase/PageSections.json"),
      "utf8"
    )
  ) as { readonly sections: LegacyPageSectionSnapshot["sections"] };
  return { birthDate, sections: value.sections };
}

function store(previous: string | null = null) {
  const calls: string[] = [];
  const reports: unknown[] = [];
  const value: LegacyPageSectionMigrationStore = {
    transaction: async (operation) =>
      operation({
        appliedChecksum: async () => previous,
        setSiteBirthDate: async () => calls.push("birth-date"),
        applySection: async (section) => calls.push(section.key),
        recordAppliedMigration: async (input) => {
          calls.push("record");
          reports.push(input.report);
        },
      }),
  };
  return { value, calls, reports };
}

describe("legacy page-section migration", () => {
  it("accepts the frozen Hero/About prose and complete legacy render order", async () => {
    const plan = planLegacyPageSectionMigration(await snapshot());

    expect(plan.issues).toEqual([]);
    expect(plan.sectionKeys).toEqual([
      "hero",
      "about",
      "skills",
      "contact",
      "projects",
      "certificates",
    ]);
    expect(plan.birthDateConfigured).toBe(true);
    expect(() => assertLegacyPageSectionMigrationReady(plan)).not.toThrow();
  });

  it("writes the private date and six sections once without recording the date", async () => {
    const target = store();
    const input = await snapshot("2000-08-10");
    const result = await applyLegacyPageSectionMigration(target.value, input);

    expect(result.applied).toBe(true);
    expect(target.calls).toEqual([
      "birth-date",
      "hero",
      "about",
      "skills",
      "contact",
      "projects",
      "certificates",
      "record",
    ]);
    expect(JSON.stringify(target.reports)).not.toContain("2000-08-10");

    const replay = store(result.plan.sourceChecksum);
    await expect(
      applyLegacyPageSectionMigration(replay.value, input)
    ).resolves.toMatchObject({ applied: false });
    expect(replay.calls).toEqual([]);
  });

  it("fails closed on missing sections, unsafe dates, and unknown tokens", async () => {
    const input = await snapshot("2000-02-30");
    const about = input.sections.find((section) => section.key === "about");
    if (about?.english === undefined) throw new Error("Missing fixture.");
    const plan = planLegacyPageSectionMigration({
      birthDate: input.birthDate,
      sections: [
        ...input.sections.filter(
          (section) => section.key !== "about" && section.key !== "contact"
        ),
        {
          ...about,
          english: {
            ...about.english,
            content: {
              ...about.english.content,
              body: ["Unknown {{secret}} value."],
            },
          },
        },
      ],
    });

    expect(plan.issues.map((migrationIssue) => migrationIssue.code)).toEqual(
      expect.arrayContaining([
        "INVALID_BIRTH_DATE",
        "MISSING_SECTION_KEY",
        "UNKNOWN_TEMPLATE_TOKEN",
      ])
    );
    expect(() => assertLegacyPageSectionMigrationReady(plan)).toThrow(
      "Legacy page-section migration preflight failed"
    );
  });
});

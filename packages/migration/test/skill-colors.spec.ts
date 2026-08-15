import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkBadgeColorContrast } from "@portfolio/contracts/appearance";
import { describe, expect, it } from "vitest";

import {
  applyLegacySkillColorMigration,
  assertLegacySkillColorMigrationReady,
  FLAGGED_LEGACY_SKILL_COLOR,
  LEGACY_SKILL_COLOR_MIGRATION_VERSION,
  planLegacyMigration,
  planLegacySkillColorMigration,
  REVIEWED_SKILL_COLOR_REPLACEMENTS,
  type LegacySkillColorMigrationStore,
  type LegacySkillColorSnapshot,
  type LegacySnapshot,
} from "../src/index.js";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const skillsPath = path.join(
  workspaceRoot,
  "apps/web/src/DataBase/Skills.json"
);

type LegacyCategories = LegacySkillColorSnapshot["categories"];

async function frozenSkills(): Promise<LegacyCategories> {
  return JSON.parse(await readFile(skillsPath, "utf8")) as LegacyCategories;
}

async function snapshot(): Promise<LegacySkillColorSnapshot> {
  return { categories: await frozenSkills() };
}

function store(previous: string | null = null) {
  const calls: string[] = [];
  const writes: { legacyId: number; color: string }[] = [];
  const reports: unknown[] = [];
  const value: LegacySkillColorMigrationStore = {
    transaction: async (operation) =>
      operation({
        appliedChecksum: async () => previous,
        setSkillColor: async (input) => {
          calls.push("color");
          writes.push({ ...input });
        },
        recordAppliedMigration: async (input) => {
          calls.push("record");
          reports.push(input.report);
        },
      }),
  };
  return { value, calls, writes, reports };
}

describe("reviewed skill-colour replacements", () => {
  it("covers exactly the three black colours in the frozen source", async () => {
    const black = (await frozenSkills()).flatMap((category) =>
      category.items
        .filter(
          (skill) => skill.color.toLowerCase() === FLAGGED_LEGACY_SKILL_COLOR
        )
        .map((skill) => skill.id)
    );

    expect(black).toEqual([202, 306, 801]);
    expect(
      REVIEWED_SKILL_COLOR_REPLACEMENTS.map(
        (replacement) => replacement.legacyId
      )
    ).toEqual(black);
  });

  it("chooses colours that clear AA on every enabled theme and for the label", () => {
    for (const replacement of REVIEWED_SKILL_COLOR_REPLACEMENTS) {
      const contrast = checkBadgeColorContrast(replacement.to);
      expect(contrast.failingThemes).toEqual([]);
      expect(contrast.passes).toBe(true);
    }
  });

  it("chooses colours no other legacy skill already uses", async () => {
    const existing = new Set(
      (await frozenSkills()).flatMap((category) =>
        category.items.map((skill) => skill.color.toLowerCase())
      )
    );
    existing.delete(FLAGGED_LEGACY_SKILL_COLOR);

    for (const replacement of REVIEWED_SKILL_COLOR_REPLACEMENTS) {
      expect(existing.has(replacement.to)).toBe(false);
    }
  });
});

describe("legacy skill-colour migration plan", () => {
  it("plans all three replacements from the frozen source with no issues", async () => {
    const plan = planLegacySkillColorMigration(await snapshot());

    expect(plan.version).toBe(LEGACY_SKILL_COLOR_MIGRATION_VERSION);
    expect(plan.issues).toEqual([]);
    expect(plan.unresolvedLegacyIds).toEqual([]);
    expect(
      plan.replacements.map((replacement) => [
        replacement.legacyId,
        replacement.to,
      ])
    ).toEqual([
      [202, "#0070f3"],
      [306, "#767676"],
      [801, "#8b5cd6"],
    ]);
    expect(() => assertLegacySkillColorMigrationReady(plan)).not.toThrow();
  });

  it("records the measured contrast beside every replacement", async () => {
    const plan = planLegacySkillColorMigration(await snapshot());

    for (const replacement of plan.replacements) {
      expect(replacement.contrast.byTheme.map((entry) => entry.theme)).toEqual([
        "dark",
        "light",
      ]);
      for (const entry of replacement.contrast.byTheme) {
        expect(entry.fillContrast).toBeGreaterThanOrEqual(
          replacement.contrast.minimum
        );
      }
      expect(replacement.contrast.labelContrast).toBeGreaterThanOrEqual(
        replacement.contrast.minimum
      );
    }
  });

  it("refuses a replacement whose source colour is no longer what was reviewed", () => {
    const plan = planLegacySkillColorMigration({
      categories: [{ id: 2, items: [{ id: 202, color: "#123456" }] }],
    });

    expect(plan.issues.map((issue) => issue.code)).toContain(
      "SOURCE_COLOR_CHANGED"
    );
    expect(() => assertLegacySkillColorMigrationReady(plan)).toThrow(
      /SOURCE_COLOR_CHANGED/
    );
  });

  it("refuses a black skill nobody reviewed rather than migrating it silently", () => {
    const plan = planLegacySkillColorMigration({
      categories: [{ id: 9, items: [{ id: 999, color: "#000000" }] }],
    });

    expect(plan.unresolvedLegacyIds).toEqual([999]);
    expect(plan.issues.map((issue) => issue.code)).toContain(
      "UNRESOLVED_SKILL_COLOR"
    );
  });

  it("refuses a reviewed replacement that is itself inaccessible", () => {
    const plan = planLegacySkillColorMigration(
      { categories: [{ id: 2, items: [{ id: 202, color: "#000000" }] }] },
      [
        {
          legacyId: 202,
          name: "Next.js (App Router)",
          from: "#000000",
          to: "#111111",
          rationale: "Deliberately still too dark for the dark theme.",
        },
      ]
    );

    expect(plan.issues.map((issue) => issue.code)).toEqual([
      "INACCESSIBLE_REPLACEMENT_COLOR",
    ]);
  });

  it("changes checksum when the decision changes, not only when the source does", async () => {
    const source = await snapshot();
    const baseline = planLegacySkillColorMigration(source);
    const different = planLegacySkillColorMigration(source, [
      { ...REVIEWED_SKILL_COLOR_REPLACEMENTS[0]!, to: "#767676" },
      ...REVIEWED_SKILL_COLOR_REPLACEMENTS.slice(1),
    ]);

    expect(different.sourceChecksum).not.toBe(baseline.sourceChecksum);
  });
});

describe("legacy skill-colour migration apply", () => {
  it("writes the three colours and records one ledger entry", async () => {
    const target = store();

    const result = await applyLegacySkillColorMigration(
      target.value,
      await snapshot()
    );

    expect(result.applied).toBe(true);
    expect(target.writes).toEqual([
      { legacyId: 202, color: "#0070f3" },
      { legacyId: 306, color: "#767676" },
      { legacyId: 801, color: "#8b5cd6" },
    ]);
    expect(target.calls).toEqual(["color", "color", "color", "record"]);
    expect(target.reports).toHaveLength(1);
  });

  it("skips an identical replay without writing anything", async () => {
    const plan = planLegacySkillColorMigration(await snapshot());
    const target = store(plan.sourceChecksum);

    const result = await applyLegacySkillColorMigration(
      target.value,
      await snapshot()
    );

    expect(result.applied).toBe(false);
    expect(target.calls).toEqual([]);
  });

  it("refuses to reuse the version for a different decision", async () => {
    const target = store("a-different-checksum");

    await expect(
      applyLegacySkillColorMigration(target.value, await snapshot())
    ).rejects.toThrow(/applied with a different source checksum/);
    expect(target.calls).toEqual([]);
  });

  it("leaves the frozen legacy source untouched", async () => {
    const before = await readFile(skillsPath, "utf8");

    await applyLegacySkillColorMigration(store().value, await snapshot());

    expect(await readFile(skillsPath, "utf8")).toBe(before);
    expect(
      (await frozenSkills())
        .flatMap((category) => category.items)
        .filter((skill) => [202, 306, 801].includes(skill.id))
        .map((skill) => skill.color)
    ).toEqual(["#000000", "#000000", "#000000"]);
  });
});

describe("base reconciliation report", () => {
  it("explains every black colour by naming its reviewed replacement", async () => {
    const source: LegacySnapshot = {
      projects: [],
      skills: (await frozenSkills()) as unknown as LegacySnapshot["skills"],
      certificates: [],
      quotes: [],
    };

    const warnings = planLegacyMigration(source).issues.filter(
      (issue) => issue.code === "LOW_CONTRAST_SKILL_COLOR"
    );

    expect(warnings).toHaveLength(3);
    for (const warning of warnings) {
      expect(warning.severity).toBe("warning");
      expect(warning.message).toContain(LEGACY_SKILL_COLOR_MIGRATION_VERSION);
      expect(warning.message).toContain("without changing the frozen source");
    }
    expect(
      warnings.map((warning) => warning.message.match(/#[0-9a-f]{6}/)?.[0])
    ).toEqual(["#0070f3", "#767676", "#8b5cd6"]);
  });
});

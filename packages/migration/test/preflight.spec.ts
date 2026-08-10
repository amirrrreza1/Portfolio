import { describe, expect, it } from "vitest";

import {
  assertMigrationReady,
  createReconciliationReport,
  planLegacyMigration,
  serializeReconciliationReport,
  type LegacySnapshot,
} from "../src/index.js";

function fixture(): LegacySnapshot {
  return {
    skills: [
      {
        id: 1,
        category: "Languages",
        items: [{ id: 101, name: "TypeScript", color: "#3178c6" }],
      },
    ],
    projects: [
      {
        id: 1,
        title: "Portfolio",
        description: "The portfolio.",
        link: "#",
        repo: "https://github.com/example/portfolio",
        technologies: [101],
        status: "Completed",
      },
    ],
    certificates: [
      {
        id: 1,
        title: "Web Design",
        description: "Foundations.",
        teacher: "Teacher",
        teacherLink: "https://example.com/teacher",
        score: "100/100",
        institute: "Institute",
        instituteLink: "https://example.com/institute",
        filePath: "/Certificates/Web-1.pdf",
        date: "2024/05/26",
      },
    ],
    quotes: [{ id: 1, text: "Short and concise.", author: "Anonymous" }],
  };
}

describe("legacy migration preflight", () => {
  it("normalizes explicitly approved legacy values and is deterministic", () => {
    const first = planLegacyMigration(fixture());
    const second = planLegacyMigration(fixture());

    expect(first).toEqual(second);
    expect(first.projects[0]).toMatchObject({
      legacyId: 1,
      slug: "portfolio",
      status: "COMPLETED",
      demoUrl: null,
    });
    expect(first.certificates[0]?.issuedAt).toBe("2024-05-26");
    expect(first.issues).toContainEqual(
      expect.objectContaining({
        code: "PLACEHOLDER_URL_REMOVED",
        severity: "warning",
      })
    );
    expect(() => assertMigrationReady(first)).not.toThrow();
  });

  it("fails closed on orphan skills, unknown status, collisions, and unsafe URLs", () => {
    const source = fixture();
    const plan = planLegacyMigration({
      ...source,
      projects: [
        ...source.projects,
        {
          ...source.projects[0]!,
          id: 2,
          status: "Shipped",
          link: "javascript:alert(1)",
          technologies: [999],
        },
      ],
    });

    expect(plan.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "PROJECT_SLUG_COLLISION",
        "UNKNOWN_PROJECT_STATUS",
        "INVALID_EXTERNAL_URL",
        "ORPHAN_PROJECT_SKILL",
      ])
    );
    expect(() => assertMigrationReady(plan)).toThrow(
      /Legacy migration preflight failed/
    );
  });

  it("reports contrast and suspected encoding without rewriting source text", () => {
    const source = fixture();
    const plan = planLegacyMigration({
      ...source,
      skills: [
        {
          ...source.skills[0]!,
          items: [{ id: 101, name: "Next.js", color: "#000000" }],
        },
      ],
      quotes: [{ id: 1, text: "Itâ€™s source text.", author: "Anonymous" }],
    });

    expect(plan.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["LOW_CONTRAST_SKILL_COLOR", "SUSPECT_MOJIBAKE"])
    );
  });

  it("serializes a deterministic review artifact without exposing write operations", () => {
    const plan = planLegacyMigration(fixture());
    const report = createReconciliationReport(plan);

    expect(report.generatedProjectSlugs).toEqual([
      { legacyId: 1, slug: "portfolio" },
    ]);
    expect(report.errors).toEqual([]);
    expect(serializeReconciliationReport(plan)).toBe(
      serializeReconciliationReport(plan)
    );
  });
});

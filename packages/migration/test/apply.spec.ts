import { describe, expect, it } from "vitest";

import {
  applyLegacyMigration,
  type LegacyMigrationStore,
  type LegacyMigrationTransaction,
  type LegacySnapshot,
} from "../src/index.js";

const snapshot: LegacySnapshot = {
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
      title: "Certificate",
      description: "Description.",
      teacher: "Teacher",
      teacherLink: "https://example.com/teacher",
      score: "100/100",
      institute: "Institute",
      instituteLink: "https://example.com/institute",
      filePath: "/Certificates/Web-1.pdf",
      date: "2024/05/26",
    },
  ],
  quotes: [{ id: 1, text: "Quote.", author: "Anonymous" }],
};

function store(previous: string | null = null) {
  const calls: string[] = [];
  const transaction: LegacyMigrationTransaction = {
    appliedChecksum: async () => previous,
    recordAppliedMigration: async () => calls.push("record"),
    upsertVerifiedMedia: async () => {
      calls.push("media");
      return "media-id";
    },
    upsertSkillCategory: async () => {
      calls.push("category");
      return "category-id";
    },
    upsertSkill: async () => {
      calls.push("skill");
      return "skill-id";
    },
    upsertProject: async () => {
      calls.push("project");
      return "project-id";
    },
    replaceProjectSkills: async () => calls.push("project-skills"),
    upsertCertificate: async () => calls.push("certificate"),
    upsertQuote: async () => calls.push("quote"),
    activateResume: async () => calls.push("resume"),
  };
  const value: LegacyMigrationStore = {
    appliedChecksum: async () => previous,
    transaction: async (operation) => operation(transaction),
  };
  return { value, calls };
}

function verifiedMedia(id: string) {
  return {
    id,
    storageKey: "media/" + id + ".pdf",
    displayName: "document.pdf",
    kind: "DOCUMENT" as const,
    mimeType: "application/pdf",
    byteSize: 100n,
    checksumSha256: "a".repeat(64),
    visibility: "PRIVATE" as const,
  };
}

const media = {
  certificatesBySourcePath: new Map([
    ["/Certificates/Web-1.pdf", verifiedMedia("media-1")],
  ]),
  resume: verifiedMedia("resume-media"),
};

describe("transactional legacy migration", () => {
  it("writes all portfolio records inside the supplied transaction", async () => {
    const target = store();
    const result = await applyLegacyMigration(target.value, snapshot, media);

    expect(result.applied).toBe(true);
    expect(target.calls).toEqual([
      "media",
      "media",
      "category",
      "skill",
      "project",
      "project-skills",
      "certificate",
      "quote",
      "resume",
      "record",
    ]);
  });

  it("is a no-op when the same version/checksum is already recorded", async () => {
    const target = store();
    const first = await applyLegacyMigration(target.value, snapshot, media);
    const replay = store(first.plan.sourceChecksum);

    const result = await applyLegacyMigration(replay.value, snapshot, media);
    expect(result.applied).toBe(false);
    expect(replay.calls).toEqual([]);
  });

  it("refuses to write when verified certificate or resume media is absent", async () => {
    const target = store();
    await expect(
      applyLegacyMigration(target.value, snapshot, {
        certificatesBySourcePath: new Map(),
        resume: { ...verifiedMedia(""), id: "" },
      })
    ).rejects.toThrow(/verified resume media|Verified certificate media/i);
    expect(target.calls).toEqual([]);
  });
});

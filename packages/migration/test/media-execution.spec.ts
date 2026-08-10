import { describe, expect, it } from "vitest";

import {
  executeLegacyMediaMigration,
  planLegacyMigration,
  type LegacyMigrationStore,
  type LegacyMigrationTransaction,
  type LegacySnapshot,
} from "../src/index.js";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n", "utf8");

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

function migrationStore(
  options: {
    readonly previous?: string | null;
    readonly transactionPrevious?: string | null;
    readonly fail?: boolean;
  } = {}
): LegacyMigrationStore {
  const transaction: LegacyMigrationTransaction = {
    appliedChecksum: async () =>
      options.transactionPrevious ?? options.previous ?? null,
    recordAppliedMigration: async () => undefined,
    upsertVerifiedMedia: async () => {
      if (options.fail) throw new Error("database unavailable");
      return "media-id";
    },
    upsertSkillCategory: async () => "category-id",
    upsertSkill: async () => "skill-id",
    upsertProject: async () => "project-id",
    replaceProjectSkills: async () => undefined,
    upsertCertificate: async () => undefined,
    upsertQuote: async () => undefined,
    activateResume: async () => undefined,
  };
  return {
    appliedChecksum: async () => options.previous ?? null,
    transaction: async (operation) => operation(transaction),
  };
}

function executorInput(store: LegacyMigrationStore, calls: string[]) {
  return {
    snapshot,
    store,
    objectStore: {
      put: async (key: string) => calls.push("put:" + key),
      remove: async (key: string) => calls.push("remove:" + key),
    },
    readLegacyFile: async (sourcePath: string) => {
      expect(["/Certificates/Web-1.pdf", "/resume.pdf"]).toContain(sourcePath);
      return PDF;
    },
    maxDocumentBytes: 1024,
  };
}

describe("legacy media migration executor", () => {
  it("skips object writes when the immutable ledger already matches", async () => {
    const calls: string[] = [];
    const checksum = planLegacyMigration(snapshot).sourceChecksum;

    await expect(
      executeLegacyMediaMigration(
        executorInput(migrationStore({ previous: checksum }), calls)
      )
    ).resolves.toEqual({ applied: false, skipped: true, uploadedCount: 0 });
    expect(calls).toEqual([]);
  });

  it("removes every newly written object when the database transaction fails", async () => {
    const calls: string[] = [];

    await expect(
      executeLegacyMediaMigration(
        executorInput(migrationStore({ fail: true }), calls)
      )
    ).rejects.toThrow("database unavailable");
    expect(calls).toHaveLength(4);
    expect(
      calls.slice(0, 2).every((call) => call.startsWith("put:media/"))
    ).toBe(true);
    expect(
      calls.slice(2).every((call) => call.startsWith("remove:media/"))
    ).toBe(true);
  });

  it("compensates objects when a competing runner commits after the ledger read", async () => {
    const calls: string[] = [];
    const checksum = planLegacyMigration(snapshot).sourceChecksum;

    await expect(
      executeLegacyMediaMigration(
        executorInput(migrationStore({ transactionPrevious: checksum }), calls)
      )
    ).resolves.toEqual({ applied: false, skipped: true, uploadedCount: 0 });
    expect(calls).toHaveLength(4);
    expect(
      calls.slice(2).every((call) => call.startsWith("remove:media/"))
    ).toBe(true);
  });
});

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  applyLegacyGitHubStatsMigration,
  assertLegacyGitHubStatsMigrationReady,
  planLegacyGitHubStatsMigration,
  type LegacyGitHubStatsMigrationStore,
  type LegacyGitHubStatsSnapshot,
} from "../src/index.js";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

async function snapshot(): Promise<LegacyGitHubStatsSnapshot> {
  const projects = JSON.parse(
    await readFile(
      path.join(workspaceRoot, "apps/web/src/DataBase/Projects.json"),
      "utf8"
    )
  ) as readonly { readonly repo?: string | null }[];
  return {
    username: "amirrrreza1",
    repositoryUrls: projects.map((project) => project.repo ?? null),
    cacheTtlSeconds: 3_600,
  };
}

function store(previous: string | null = null) {
  const calls: string[] = [];
  const settings: unknown[] = [];
  const reports: unknown[] = [];
  const value: LegacyGitHubStatsMigrationStore = {
    transaction: async (operation) =>
      operation({
        appliedChecksum: async () => previous,
        setGitHubStatsSettings: async (input) => {
          calls.push("settings");
          settings.push(input);
        },
        recordAppliedMigration: async (input) => {
          calls.push("record");
          reports.push(input.report);
        },
      }),
  };
  return { value, calls, settings, reports };
}

describe("legacy GitHub statistics migration", () => {
  it("derives the exact 13-repository allowlist from the frozen source", async () => {
    const plan = planLegacyGitHubStatsMigration(await snapshot());

    expect(plan.issues).toEqual([]);
    expect(plan.username).toBe("amirrrreza1");
    expect(plan.repositoryAllowlist).toHaveLength(13);
    expect(plan.repositoryAllowlist).toEqual(
      expect.arrayContaining(["Portfolio", "OS-Scheduler", "Amazon-React"])
    );
    expect(() => assertLegacyGitHubStatsMigrationReady(plan)).not.toThrow();
  });

  it("applies once and rejects a changed source under the same version", async () => {
    const input = await snapshot();
    const target = store();
    const result = await applyLegacyGitHubStatsMigration(target.value, input);

    expect(result.applied).toBe(true);
    expect(target.calls).toEqual(["settings", "record"]);
    expect(target.settings).toEqual([
      {
        username: "amirrrreza1",
        repositoryAllowlist: result.plan.repositoryAllowlist,
        cacheTtlSeconds: 3_600,
      },
    ]);
    expect(target.reports).toHaveLength(1);

    const replay = store(result.plan.sourceChecksum);
    await expect(
      applyLegacyGitHubStatsMigration(replay.value, input)
    ).resolves.toMatchObject({ applied: false });
    expect(replay.calls).toEqual([]);

    await expect(
      applyLegacyGitHubStatsMigration(store("different").value, input)
    ).rejects.toThrow(/different source checksum/i);
  });

  it("fails closed on arbitrary hosts, owner mismatch, duplicates, and unsafe TTL", async () => {
    const plan = planLegacyGitHubStatsMigration({
      username: "amirrrreza1",
      repositoryUrls: [
        "https://attacker.example/amirrrreza1/Portfolio",
        "https://github.com/other/Portfolio",
        "https://github.com/amirrrreza1/Allowed",
        "https://github.com/amirrrreza1/allowed",
      ],
      cacheTtlSeconds: 1,
    });

    expect(plan.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "INVALID_CACHE_TTL",
        "INVALID_REPOSITORY_URL",
        "REPOSITORY_OWNER_MISMATCH",
        "DUPLICATE_REPOSITORY",
      ])
    );
    expect(() => assertLegacyGitHubStatsMigrationReady(plan)).toThrow(
      /preflight failed/i
    );
  });
});

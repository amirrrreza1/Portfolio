import { createHash } from "node:crypto";

import {
  githubRepositoryNameSchema,
  githubUsernameSchema,
} from "@portfolio/contracts/portfolio";

export const LEGACY_GITHUB_STATS_MIGRATION_VERSION =
  "2026-08-14.github-stats.1";

export interface LegacyGitHubStatsSnapshot {
  readonly username: string;
  readonly repositoryUrls: readonly (string | null)[];
  readonly cacheTtlSeconds: number;
}

export interface LegacyGitHubStatsMigrationIssue {
  readonly code: string;
  readonly location: string;
  readonly message: string;
}

export interface LegacyGitHubStatsMigrationPlan {
  readonly version: typeof LEGACY_GITHUB_STATS_MIGRATION_VERSION;
  readonly sourceChecksum: string;
  readonly username: string;
  readonly repositoryAllowlist: readonly string[];
  readonly cacheTtlSeconds: number;
  readonly issues: readonly LegacyGitHubStatsMigrationIssue[];
}

export interface LegacyGitHubStatsMigrationTransaction {
  appliedChecksum(version: string): Promise<string | null>;
  setGitHubStatsSettings(input: {
    readonly username: string;
    readonly repositoryAllowlist: readonly string[];
    readonly cacheTtlSeconds: number;
  }): Promise<void>;
  recordAppliedMigration(input: {
    readonly version: string;
    readonly checksum: string;
    readonly report: unknown;
  }): Promise<void>;
}

export interface LegacyGitHubStatsMigrationStore {
  transaction<T>(
    operation: (
      transaction: LegacyGitHubStatsMigrationTransaction
    ) => Promise<T>
  ): Promise<T>;
}

export interface AppliedLegacyGitHubStatsMigration {
  readonly applied: boolean;
  readonly plan: LegacyGitHubStatsMigrationPlan;
}

export function planLegacyGitHubStatsMigration(
  snapshot: LegacyGitHubStatsSnapshot
): LegacyGitHubStatsMigrationPlan {
  const issues: LegacyGitHubStatsMigrationIssue[] = [];
  const username = snapshot.username.trim();
  if (!githubUsernameSchema.safeParse(username).success) {
    issue(
      issues,
      "INVALID_GITHUB_USERNAME",
      "username",
      "GitHub username is not canonical."
    );
  }
  if (
    !Number.isSafeInteger(snapshot.cacheTtlSeconds) ||
    snapshot.cacheTtlSeconds < 60 ||
    snapshot.cacheTtlSeconds > 86_400
  ) {
    issue(
      issues,
      "INVALID_CACHE_TTL",
      "cacheTtlSeconds",
      "Cache TTL must be an integer from 60 through 86400 seconds."
    );
  }

  const repositories: string[] = [];
  const seen = new Set<string>();
  for (const [index, repositoryUrl] of snapshot.repositoryUrls.entries()) {
    if (repositoryUrl === null) continue;
    const repository = parseRepositoryUrl(repositoryUrl);
    if (repository === null) {
      issue(
        issues,
        "INVALID_REPOSITORY_URL",
        `repositoryUrls[${index}]`,
        "Repository must be a canonical HTTPS github.com owner/name URL."
      );
      continue;
    }
    if (repository.owner.toLowerCase() !== username.toLowerCase()) {
      issue(
        issues,
        "REPOSITORY_OWNER_MISMATCH",
        `repositoryUrls[${index}]`,
        "Repository owner does not match the configured GitHub username."
      );
      continue;
    }
    const normalized = repository.name.toLowerCase();
    if (seen.has(normalized)) {
      issue(
        issues,
        "DUPLICATE_REPOSITORY",
        `repositoryUrls[${index}]`,
        "Repository appears more than once in the legacy source."
      );
      continue;
    }
    seen.add(normalized);
    repositories.push(repository.name);
  }
  if (repositories.length === 0) {
    issue(
      issues,
      "EMPTY_REPOSITORY_ALLOWLIST",
      "repositoryUrls",
      "At least one repository is required to enable GitHub statistics."
    );
  }

  return {
    version: LEGACY_GITHUB_STATS_MIGRATION_VERSION,
    sourceChecksum: createHash("sha256")
      .update(JSON.stringify(snapshot))
      .digest("hex"),
    username,
    repositoryAllowlist: repositories,
    cacheTtlSeconds: snapshot.cacheTtlSeconds,
    issues,
  };
}

export function assertLegacyGitHubStatsMigrationReady(
  plan: LegacyGitHubStatsMigrationPlan
): void {
  if (plan.issues.length === 0) return;
  throw new Error(
    "Legacy GitHub-statistics migration preflight failed:\n" +
      plan.issues
        .map(
          (migrationIssue) =>
            `${migrationIssue.code} at ${migrationIssue.location}: ${migrationIssue.message}`
        )
        .join("\n")
  );
}

export async function applyLegacyGitHubStatsMigration(
  store: LegacyGitHubStatsMigrationStore,
  snapshot: LegacyGitHubStatsSnapshot
): Promise<AppliedLegacyGitHubStatsMigration> {
  const plan = planLegacyGitHubStatsMigration(snapshot);
  assertLegacyGitHubStatsMigrationReady(plan);

  return store.transaction(async (transaction) => {
    const previous = await transaction.appliedChecksum(plan.version);
    if (previous === plan.sourceChecksum) return { applied: false, plan };
    if (previous !== null) {
      throw new Error(
        `Migration version ${plan.version} was applied with a different source checksum.`
      );
    }
    await transaction.setGitHubStatsSettings({
      username: plan.username,
      repositoryAllowlist: plan.repositoryAllowlist,
      cacheTtlSeconds: plan.cacheTtlSeconds,
    });
    await transaction.recordAppliedMigration({
      version: plan.version,
      checksum: plan.sourceChecksum,
      report: {
        migrationVersion: plan.version,
        sourceChecksum: plan.sourceChecksum,
        username: plan.username,
        repositoryAllowlist: plan.repositoryAllowlist,
        cacheTtlSeconds: plan.cacheTtlSeconds,
        errors: plan.issues,
      },
    });
    return { applied: true, plan };
  });
}

function parseRepositoryUrl(
  input: string
): { readonly owner: string; readonly name: string } | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return null;
  const [owner, name] = segments;
  if (
    owner === undefined ||
    name === undefined ||
    !githubUsernameSchema.safeParse(owner).success ||
    !githubRepositoryNameSchema.safeParse(name).success
  ) {
    return null;
  }
  return { owner, name };
}

function issue(
  issues: LegacyGitHubStatsMigrationIssue[],
  code: string,
  location: string,
  message: string
): void {
  issues.push({ code, location, message });
}

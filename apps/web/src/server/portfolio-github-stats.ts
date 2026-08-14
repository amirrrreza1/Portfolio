import "server-only";

import type { PublicSiteSettings } from "@portfolio/contracts/portfolio";
import { connection } from "next/server";

import type { Projects } from "@/Components/Projects/Types";
import {
  createGitHubStatsReader,
  type GitHubStatsByRepository,
} from "./github-stats-source";

let reader: ReturnType<typeof createGitHubStatsReader> | undefined;

export async function getPortfolioGitHubStats(
  settings: PublicSiteSettings,
  projects: readonly Projects[]
): Promise<GitHubStatsByRepository> {
  // Third-party reads are request-time work. This prevents production builds
  // from depending on GitHub availability or consuming the deployment IP's
  // rate limit during prerender analysis.
  await connection();
  reader ??= createGitHubStatsReader({
    token: process.env.GITHUB_STATS_TOKEN,
    onStale: ({ repository, ageMs }) => {
      console.warn("Serving stale GitHub statistics", { repository, ageMs });
    },
    onUnavailable: ({ repository }) => {
      console.warn("GitHub statistics unavailable", { repository });
    },
  });
  return reader(
    settings,
    projects.map((project) => project.repo)
  );
}

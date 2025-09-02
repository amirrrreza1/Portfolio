"use client";

import { useEffect, useState } from "react";

export function useGitHubStats(repoUrl: string) {
  const [stats, setStats] = useState<{ stars: number; commits: number } | null>(
    null
  );

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const repoName = repoUrl.replace("https://github.com/", "");
        const repoRes = await fetch(`https://api.github.com/repos/${repoName}`);
        const repoData = await repoRes.json();
        const commitsRes = await fetch(
          `https://api.github.com/repos/${repoName}/commits?per_page=1`
        );
        const commits = commitsRes.headers.get("Link");
        let commitCount = 0;
        if (commits && commits.includes('rel="last"')) {
          const lastPage = commits.match(/page=(\d+)>; rel="last"/);
          if (lastPage) commitCount = parseInt(lastPage[1], 10);
        }
        setStats({ stars: repoData.stargazers_count, commits: commitCount });
      } catch (err) {
        console.error("GitHub API error:", err);
      }
    };

    fetchStats();
  }, [repoUrl]);

  return stats;
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import ScrambleText from "@/Components/UI/ScrumbleText/ScrumbleText";
import Devider from "@/Components/UI/Devider/Devider";
import type { Projects } from "@/Components/Projects/Types";
import type { SkillCategory } from "@/Components/Skills/Types";
import ProjectCard from "@/Components/Projects/ProjectCard";
import Button from "@/Components/UI/Buttons/CustomBTN";
import ThemeToggle from "@/Components/UI/Buttons/ThemeToggle";
import Tooltip from "@/Components/UI/Tooltip/Tooltip";
import { localePath } from "@/i18n/routing";
import type { Locale } from "@portfolio/contracts/common";
import { getMessages } from "@/i18n/messages";
import type { GitHubStatsByRepository } from "@/server/github-stats-source";

function buildSearchHaystack(
  project: Projects,
  skills: readonly SkillCategory[]
) {
  const techTokens = project.technologies.flatMap((id) => {
    for (const group of skills) {
      const skill = group.items.find((item) => item.id === id);
      if (skill) return [String(id), skill.name, group.category];
    }

    return [String(id)];
  });

  return [
    project.id,
    project.title,
    project.description,
    project.status,
    project.link,
    project.repo,
    ...techTokens,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function ProjectsGallery({
  locale,
  projects,
  skills,
  githubStats,
}: {
  locale: Locale;
  projects: readonly Projects[];
  skills: readonly SkillCategory[];
  githubStats: GitHubStatsByRepository;
}) {
  const messages = getMessages(locale);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredProjects = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return projects;

    return projects.filter((project) =>
      buildSearchHaystack(project, skills).includes(query)
    );
  }, [projects, searchTerm, skills]);

  return (
    <main className="min-h-screen px-4 py-10 pt-20">
      <header className="fixed top-5 right-0 left-0 z-50 flex justify-center px-4">
        <div className="bg-surface border-border flex w-full max-w-lg items-center gap-3 rounded border px-3 py-2 shadow-xl backdrop-blur-md md:gap-4 md:px-5">
          <Tooltip title={messages.common.back}>
            <Link
              href={localePath(locale)}
              aria-label={messages.common.backHome}
              className="h-10 w-fit"
            >
              <Button className="flex h-10 w-10 items-center justify-center !px-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          </Tooltip>

          <div className="group relative flex-1">
            <Search className="group-focus-within:text-text absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted transition-colors" />
            <input
              type="search"
              placeholder={messages.projects.searchPlaceholder}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="bg-surface border-border focus:border-border focus:bg-surface h-10 w-full cursor-none border py-2 pr-10 pl-10 text-sm transition-all outline-none placeholder:text-text-muted"
            />
          </div>
          <Tooltip title={messages.common.theme}>
            <ThemeToggle locale={locale} />
          </Tooltip>
        </div>
      </header>

      <section className="Container mx-auto mt-6 border p-4 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between gap-4 px-2">
          <ScrambleText
            text={messages.projects.all}
            className="text-2xl"
            speed={30}
          />
        </div>

        <Devider />

        <div className="my-6 grid grid-cols-1 gap-6 px-1 md:px-4 lg:px-6">
          {filteredProjects.length > 0 ? (
            filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                pj={project}
                skills={skills}
                locale={locale}
                stats={
                  project.repo === null
                    ? null
                    : (githubStats[project.repo] ?? null)
                }
              />
            ))
          ) : (
            <div className="border border-dashed py-20 text-center opacity-50">
              <p>{messages.projects.none}</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

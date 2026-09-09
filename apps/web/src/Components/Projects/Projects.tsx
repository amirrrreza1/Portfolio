import ProjectCard from "./ProjectCard";
import { Projects } from "./Types";
import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";
import { B } from "../UI/TextArea/TextArea";
import Link from "next/link";
import Button from "../UI/Buttons/CustomBTN";
import type { SkillCategory } from "../Skills/Types";
import type { Locale } from "@portfolio/contracts/common";
import { localePath } from "@/i18n/routing";
import { getMessages } from "@/i18n/messages";
import type { GitHubStatsByRepository } from "@/server/github-stats-source";

export default function ProjectsSection({
  locale,
  projects,
  skills,
  githubStats,
}: {
  readonly locale: Locale;
  readonly projects: readonly Projects[];
  readonly skills: readonly SkillCategory[];
  readonly githubStats: GitHubStatsByRepository;
}) {
  const messages = getMessages(locale);
  return (
    <section
      className="Container my-10 border p-2 backdrop-blur-sm"
      id="projects"
    >
      <ScrambleText text="Projects" className="ml-3 text-3xl" speed={30} />
      <Devider />

      <div className="my-6 space-y-4 px-1 md:px-4 lg:space-y-8 lg:px-6">
        {projects.slice(0, 3).map((pj) => (
          <ProjectCard
            key={pj.id}
            pj={pj}
            skills={skills}
            locale={locale}
            stats={pj.repo === null ? null : (githubStats[pj.repo] ?? null)}
          />
        ))}
        <div className="flex flex-col items-center justify-between gap-6 border p-8 shadow-lg md:flex-row">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">
              {messages.projects.lookingFor}{" "}
              <B>{messages.projects.moreEmphasis}</B>?
            </h3>
            <p className="text-text-muted max-w-md text-justify">
              {messages.projects.highlights}
            </p>
          </div>

          <Link href={localePath(locale, "projects")}>
            <Button className="px-8 py-3">
              <span className="font-bold">{messages.projects.viewAll}</span>
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

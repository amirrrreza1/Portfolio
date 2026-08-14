import type { Locale } from "@portfolio/contracts/common";
import type { PublicProjects } from "@portfolio/contracts/portfolio";

import type { Projects } from "@/Components/Projects/Types";
import type { SkillCategory } from "@/Components/Skills/Types";
import {
  parsePortfolioDataSource,
  type PortfolioDataSource,
} from "./portfolio-data-source";

export { parsePortfolioDataSource, type PortfolioDataSource };

export interface PortfolioProjectsView {
  readonly projects: readonly Projects[];
  readonly skills: readonly SkillCategory[];
}

export interface PortfolioProjectsSourceDependencies {
  readonly readDatabase: (locale: Locale) => Promise<PublicProjects>;
  readonly readLegacy: () => PortfolioProjectsView;
}

export async function selectPortfolioProjects(
  source: PortfolioDataSource,
  locale: Locale,
  dependencies: PortfolioProjectsSourceDependencies
): Promise<PortfolioProjectsView> {
  if (source === "legacy") return dependencies.readLegacy();
  return toProjectView(await dependencies.readDatabase(locale));
}

export function toProjectView(data: PublicProjects): PortfolioProjectsView {
  return {
    projects: data.projects.map((project) => ({
      id: project.id,
      slug: project.slug,
      title: project.title,
      description: project.summary,
      link: project.demoUrl,
      repo: project.repositoryUrl,
      image: project.image,
      technologies: project.skillIds,
      status: project.status === "COMPLETED" ? "completed" : "in-progress",
    })),
    skills: data.skillCategories.map((category) => ({
      id: category.id,
      category: category.name,
      items: category.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        color: skill.color,
      })),
    })),
  };
}

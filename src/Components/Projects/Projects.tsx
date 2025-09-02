"use client";

import { useEffect, useState } from "react";
import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";
import { useGitHubStats } from "@/Utils/getGithubStats";
import Button from "../UI/Buttons/CustomBTN";
import Skills from "@/DataBase/Skills.json";
import Project from "@/DataBase/Projects.json";
import { getTextColor } from "@/Utils/getTextColor";

type Project = {
  id: number;
  title: string;
  description: string;
  link: string;
  repo: string;
  image: string;
  technologies: number[];
  status: "completed" | "in-progress";
};

const Projects = Project as Project[];

const findSkillById = (id: number) => {
  for (const category of Skills) {
    const skill = category.items.find((item) => item.id === id);
    if (skill) return skill;
  }
  return null;
};

export default function ProjectsSection() {
  const [visibleIds, setVisibleIds] = useState<number[]>([]);

  useEffect(() => {
    const handleScroll = () => {
      Projects.forEach((project) => {
        const element = document.getElementById(`project-${project.id}`);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top < window.innerHeight - 100) {
            if (!visibleIds.includes(project.id)) {
              setVisibleIds((prev) => [...prev, project.id]);
            }
          }
        }
      });
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [visibleIds]);

  return (
    <section className="Container backdrop-blur-sm p-2 border my-10">
      <ScrambleText
        text="Projects"
        className="text-3xl ml-3"
        delayBeforeFix={1000}
      />
      <Devider />

      <div className="space-y-8 px-6 my-6">
        {Projects.map((project) => {
          const stats = useGitHubStats(project.repo);

          return (
            <div
              key={project.id}
              id={`project-${project.id}`}
              className={`p-6 shadow-lg border transition-transform duration-700 ease-out ${
                visibleIds.includes(project.id)
                  ? "translate-y-0 opacity-100"
                  : "translate-y-10 opacity-0"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-2xl font-bold">{project.title}</h3>{" "}
                <p
                  className={`text-sm font-medium ${
                    project.status === "completed"
                      ? "text-main-green"
                      : "text-main-red"
                  }`}
                >
                  {project.status === "completed" ? "Open" : "Closed"}
                </p>
              </div>
              <p className="text-secondary/70 mb-4">{project.description}</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {project.technologies.map((techId) => {
                  const skill = findSkillById(techId);
                  if (!skill) return null;
                  const textColor = getTextColor(skill.color);
                  return (
                    <span
                      key={techId}
                      className="px-3 py-1 text-sm shadow"
                      style={{
                        backgroundColor: skill.color,
                        color: textColor,
                      }}
                    >
                      {skill.name}
                    </span>
                  );
                })}
              </div>
              {stats ? (
                <div className="flex gap-6 text-sm mb-4">
                  <span className="text-[#E2B340]">
                    {stats.stars || 0} Stars
                  </span>
                  <span>{stats.commits} Commits</span>
                </div>
              ) : (
                <p className="text-sm text-gray-400 mb-4">Loading stats...</p>
              )}
              <div className="flex gap-6">
                <Button>
                  <a href={project.link} target="_blank">
                    View Project
                  </a>
                </Button>
                <Button>
                  <a href={project.repo} target="_blank">
                    GitHub Repo
                  </a>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

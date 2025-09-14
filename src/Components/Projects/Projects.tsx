"use client";

import { motion } from "framer-motion";
import { useState } from "react";
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
  return (
    <section
      className="Container backdrop-blur-sm p-2 border my-10"
      id="projects"
    >
      <ScrambleText text="Projects" className="text-3xl ml-3" speed={30} />
      <Devider />

      <div className="space-y-8 px-6 my-6">
        {Projects.map((project) => {
          const stats = useGitHubStats(project.repo);
          const [showAll, setShowAll] = useState(false);

          const maxVisible = 4;
          const visibleTechs = showAll
            ? project.technologies
            : project.technologies.slice(0, maxVisible);

          const hiddenCount =
            project.technologies.length > maxVisible
              ? project.technologies.length - maxVisible
              : 0;

          return (
            <motion.div
              key={project.id}
              id={`project-${project.id}`}
              className="p-6 shadow-lg border"
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              viewport={{ once: true, amount: 0.2 }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-2xl font-bold">{project.title}</h3>
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
                {visibleTechs.map((techId, idx) => {
                  const skill = findSkillById(techId);
                  if (!skill) return null;
                  return (
                    <span
                      key={`${project.id}-${techId}-${idx}`}
                      className="px-3 py-1 text-sm font-medium border-[1px] border-secondary"
                      style={{
                        backgroundColor: skill.color,
                        color: getTextColor(skill.color),
                      }}
                    >
                      {skill.name}
                    </span>
                  );
                })}

                {hiddenCount > 0 && (
                  <Button
                    onClick={() => setShowAll((prev) => !prev)}
                    className="!px-3 !py-1"
                  >
                    {showAll ? "Show less" : `+${hiddenCount} more`}
                  </Button>
                )}
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
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

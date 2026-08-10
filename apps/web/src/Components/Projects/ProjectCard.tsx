"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import Button from "../UI/Buttons/CustomBTN";
import { getTextColor } from "@/Utils/getTextColor";
import { useGitHubStats } from "@/Utils/getGithubStats";
import Skills from "@/DataBase/Skills.json";
import { Projects } from "./Types";

const findSkillById = (id: number) => {
  for (const category of Skills) {
    const skill = category.items.find((item) => item.id === id);
    if (skill) return skill;
  }
  return null;
};

export default function ProjectCard({ pj }: { pj: Projects }) {
  const stats = useGitHubStats(pj.repo ?? "");
  const [showAll, setShowAll] = useState(false);

  const maxVisible = 4;
  const visibleTechs = showAll
    ? pj.technologies
    : pj.technologies.slice(0, maxVisible);

  const hiddenCount =
    pj.technologies.length > maxVisible
      ? pj.technologies.length - maxVisible
      : 0;

  return (
    <motion.div
      id={`pj-${pj.id}`}
      className="border p-6 shadow-lg"
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      viewport={{ once: true, amount: 0.2 }}
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-2xl font-bold">{pj.title}</h3>
        <p
          className={`text-sm font-medium ${
            pj.status === "completed" ? "text-main-green" : "text-main-red"
          }`}
        >
          {pj.status === "completed" ? "Open" : "Closed"}
        </p>
      </div>

      <p className="text-secondary/70 mb-4">{pj.description}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        {visibleTechs.map((techId, idx) => {
          const skill = findSkillById(techId);
          if (!skill) return null;
          return (
            <span
              key={`${pj.id}-${techId}-${idx}`}
              className="border-secondary border-[1px] px-3 py-1 text-sm font-medium"
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
        <div className="mb-4 flex gap-6 text-sm">
          <span className="text-[#E2B340]">{stats.stars || 0} Stars</span>
          <span>{stats.commits} Commits</span>
        </div>
      ) : (
        <p className="mb-4 text-sm text-gray-400">Loading stats...</p>
      )}

      <div className="flex gap-6">
        {pj.link && (
          <Button>
            <a href={pj.link} target="_blank" rel="noopener noreferrer">
              View Project
            </a>
          </Button>
        )}
        {pj.repo && (
          <Button>
            <a href={pj.repo} target="_blank" rel="noopener noreferrer">
              GitHub Repo
            </a>
          </Button>
        )}
      </div>
    </motion.div>
  );
}

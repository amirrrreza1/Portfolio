"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import Button from "../UI/Buttons/CustomBTN";
import type { SkillCategory } from "@/Components/Skills/Types";
import { localePath } from "@/i18n/routing";
import type { Locale } from "@portfolio/contracts/common";
import Link from "next/link";
import { Projects } from "./Types";
import { getMessages } from "@/i18n/messages";
import { formatNumber } from "@/i18n/format";
import type { GitHubRepositoryStats } from "@/server/github-stats-source";

const findSkillById = (
  skills: readonly SkillCategory[],
  id: string | number
) => {
  for (const category of skills) {
    const skill = category.items.find((item) => item.id === id);
    if (skill) return skill;
  }
  return null;
};

export default function ProjectCard({
  pj,
  skills,
  locale,
  stats,
}: {
  pj: Projects;
  skills: readonly SkillCategory[];
  locale: Locale;
  stats: GitHubRepositoryStats | null;
}) {
  const messages = getMessages(locale);
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
          {pj.status === "completed"
            ? messages.projects.completed
            : messages.projects.inProgress}
        </p>
      </div>

      <p className="text-secondary/70 mb-4">{pj.description}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        {visibleTechs.map((techId, idx) => {
          const skill = findSkillById(skills, techId);
          if (!skill) return null;
          return (
            <span
              key={`${pj.id}-${techId}-${idx}`}
              className="border-secondary/40 bg-secondary/10 text-secondary border px-3 py-1 text-sm font-medium"
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
            {showAll
              ? messages.projects.showLess
              : `+${formatNumber(hiddenCount, locale)} ${messages.projects.more}`}
          </Button>
        )}
      </div>

      {pj.repo && stats ? (
        <div className="mb-4 flex gap-6 text-sm">
          <span className="text-Gold">
            {formatNumber(stats.stars, locale)} {messages.projects.stars}
          </span>
          <span>
            {formatNumber(stats.commits, locale)} {messages.projects.commits}
          </span>
        </div>
      ) : pj.repo ? (
        <p className="mb-4 text-sm text-gray-400">
          {messages.projects.statsUnavailable}
        </p>
      ) : null}

      <div className="flex gap-6">
        <Link href={localePath(locale, `projects/${pj.slug}`)}>
          <Button>{messages.projects.details}</Button>
        </Link>
        {pj.link && (
          <Button>
            <a href={pj.link} target="_blank" rel="noopener noreferrer">
              {messages.projects.view}
            </a>
          </Button>
        )}
        {pj.repo && (
          <Button>
            <a href={pj.repo} target="_blank" rel="noopener noreferrer">
              {messages.projects.repository}
            </a>
          </Button>
        )}
      </div>
    </motion.div>
  );
}

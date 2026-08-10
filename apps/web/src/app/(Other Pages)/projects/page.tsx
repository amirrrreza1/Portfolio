"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import projectsData from "@/DataBase/Projects.json";
import skillsData from "@/DataBase/Skills.json";
import ScrambleText from "@/Components/UI/ScrumbleText/ScrumbleText";
import Devider from "@/Components/UI/Devider/Devider";
import { Projects } from "@/Components/Projects/Types";
import ProjectCard from "@/Components/Projects/ProjectCard";
import Button from "@/Components/UI/Buttons/CustomBTN";
import ThemeToggle from "@/Components/UI/Buttons/ThemeToggle";
import Tooltip from "@/Components/UI/Tooltip/Tooltip";

const AllProjects = projectsData as Projects[];

const skillsLookup = new Map<number, { name: string; category: string }>();
for (const group of skillsData) {
  for (const item of group.items) {
    skillsLookup.set(item.id, { name: item.name, category: group.category });
  }
}

const buildSearchHaystack = (pj: Projects) => {
  const techTokens = (pj.technologies ?? []).flatMap((id) => {
    const skill = skillsLookup.get(id);
    if (!skill) return [String(id)];
    return [String(id), skill.name, skill.category];
  });

  return [
    pj.id,
    pj.title,
    pj.description,
    pj.status,
    pj.link,
    pj.repo,
    ...techTokens,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

export default function ProjectsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const filteredProjects = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return AllProjects;
    return AllProjects.filter((pj) => buildSearchHaystack(pj).includes(query));
  }, [searchTerm]);

  return (
    <main className="min-h-screen px-4 py-10 pt-20">
      {mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <header className="fixed top-5 right-0 left-0 z-50 flex justify-center px-4">
            <div className="bg-secondary/20 border-secondary/20 flex w-full max-w-lg items-center gap-3 rounded border px-3 py-2 shadow-xl backdrop-blur-md md:gap-4 md:px-5">
              <Tooltip title="Back">
                <Link href="/" aria-label="Back to home" className="h-10 w-fit">
                  <Button className="flex h-10 w-10 items-center justify-center !px-0">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
              </Tooltip>

              <div className="group relative flex-1">
                <Search className="group-focus-within:text-secondary absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400 transition-colors" />
                <input
                  type="text"
                  placeholder="Search anything..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-secondary/5 border-secondary/20 focus:border-secondary/40 focus:bg-secondary/10 h-10 w-full cursor-none border py-2 pr-10 pl-10 text-sm transition-all outline-none placeholder:text-gray-500"
                />
              </div>
              <Tooltip title="Theme">
                <ThemeToggle />
              </Tooltip>
            </div>
          </header>,
          document.body
        )}

      <section className="Container mx-auto mt-6 border p-4 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between gap-4 px-2">
          <ScrambleText text="All Projects" className="text-2xl" speed={30} />
        </div>

        <Devider />

        <div className="my-6 grid grid-cols-1 gap-6 px-1 md:px-4 lg:px-6">
          {filteredProjects.length > 0 ? (
            filteredProjects.map((pj) => <ProjectCard key={pj.id} pj={pj} />)
          ) : (
            <div className="border border-dashed py-20 text-center opacity-50">
              <p>No projects found matching your search.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, Search, X } from "lucide-react";
import projectsData from "@/DataBase/Projects.json";
import skillsData from "@/DataBase/Skills.json";
import ScrambleText from "@/Components/UI/ScrumbleText/ScrumbleText";
import Devider from "@/Components/UI/Devider/Devider";
import { B } from "@/Components/UI/TextArea/TextArea";
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
          <header className="fixed top-5 left-0 right-0 z-50 flex justify-center px-4">
            <div className="flex items-center gap-3 md:gap-4 px-3 md:px-5 py-2 backdrop-blur-md bg-secondary/20 border border-secondary/20 shadow-xl w-full max-w-lg rounded">
              <Tooltip title="Back">
                <Link href="/" aria-label="Back to home" className="w-fit h-10">
                  <Button className="flex items-center justify-center !px-0 h-10 w-10">
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                </Link>
              </Tooltip>

              <div className="relative flex-1 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-secondary transition-colors" />
                <input
                  type="text"
                  placeholder="Search anything..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-10 bg-secondary/5 cursor-none border border-secondary/20 py-2 pl-10 pr-10 text-sm outline-none focus:border-secondary/40 focus:bg-secondary/10 transition-all placeholder:text-gray-500"
                />
              </div>
              <Tooltip title="Theme">
                <ThemeToggle />
              </Tooltip>
            </div>
          </header>,
          document.body,
        )}

      <section className="Container backdrop-blur-sm p-4 border mx-auto mt-6">
        <div className="flex items-center justify-between gap-4 mb-4 px-2">
          <ScrambleText text="All Projects" className="text-2xl" speed={30} />
        </div>

        <Devider />

        <div className="grid grid-cols-1 gap-6 px-1 md:px-4 lg:px-6 my-6">
          {filteredProjects.length > 0 ? (
            filteredProjects.map((pj) => <ProjectCard key={pj.id} pj={pj} />)
          ) : (
            <div className="py-20 text-center border border-dashed opacity-50">
              <p>No projects found matching your search.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

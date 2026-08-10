import ProjectCard from "./ProjectCard";
import projects from "@/DataBase/Projects.json";
import { Projects } from "./Types";
import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";
import { B } from "../UI/TextArea/TextArea";
import Link from "next/link";
import Button from "../UI/Buttons/CustomBTN";

const Project = projects as Projects[];

export default function ProjectsSection() {
  return (
    <section
      className="Container my-10 border p-2 backdrop-blur-sm"
      id="projects"
    >
      <ScrambleText text="Projects" className="ml-3 text-3xl" speed={30} />
      <Devider />

      <div className="my-6 space-y-4 px-1 md:px-4 lg:space-y-8 lg:px-6">
        {Project.slice(0, 3).map((pj) => (
          <ProjectCard key={pj.id} pj={pj} />
        ))}
        <div className="flex flex-col items-center justify-between gap-6 border p-8 shadow-lg md:flex-row">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">
              Looking for <B>more</B>?
            </h3>
            <p className="max-w-md text-justify text-gray-400">
              These are just my highlights projects. You can explore my full
              archive of projects , and past works in the main gallery.
            </p>
          </div>

          <Link href="/projects">
            <Button className="px-8 py-3">
              <span className="font-bold">View All Projects</span>
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

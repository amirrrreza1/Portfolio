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
      className="Container backdrop-blur-sm p-2 border my-10"
      id="projects"
    >
      <ScrambleText text="Projects" className="text-3xl ml-3" speed={30} />
      <Devider />

      <div className="space-y-4 lg:space-y-8 px-1 md:px-4 lg:px-6 my-6">
        {Project.slice(0, 3).map((pj) => (
          <ProjectCard key={pj.id} pj={pj} />
        ))}
        <div className="shadow-lg border p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">
              Looking for <B>more</B>?
            </h3>
            <p className="text-gray-400 max-w-md text-justify">
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

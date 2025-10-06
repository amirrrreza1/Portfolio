import ProjectCard from "./ProjectCard";
import projects from "@/DataBase/Projects.json";
import { Projects } from "./Types";
import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";

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
        {Project.map((pj) => (
          <ProjectCard key={pj.id} pj={pj} />
        ))}
      </div>
    </section>
  );
}

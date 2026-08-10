import ProjectsGallery from "@/Components/Projects/ProjectsGallery";
import { getLegacyPortfolioData } from "@/server/legacy-portfolio";

export default function ProjectsPage() {
  const { projects, skills } = getLegacyPortfolioData();

  return <ProjectsGallery projects={projects} skills={skills} />;
}

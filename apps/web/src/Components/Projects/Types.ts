import type { PublicProjectImage } from "@portfolio/contracts/portfolio";

export type Projects = {
  id: string | number;
  slug: string;
  title: string;
  description: string;
  link: string | null;
  repo: string | null;
  image: PublicProjectImage | null;
  technologies: (string | number)[];
  status: "completed" | "in-progress";
};

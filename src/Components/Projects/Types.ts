export type Projects = {
  id: number;
  title: string;
  description: string;
  link: string;
  repo: string;
  image: string;
  technologies: number[];
  status: "completed" | "in-progress";
};

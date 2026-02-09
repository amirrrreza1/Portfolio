export type Projects = {
  id: number;
  title: string;
  description: string;
  link: string | null;
  repo: string | null;
  image: string;
  technologies: number[];
  status: "completed" | "in-progress";
};

export type Projects = {
  id: string | number;
  title: string;
  description: string;
  link: string | null;
  repo: string | null;
  technologies: (string | number)[];
  status: "completed" | "in-progress";
};

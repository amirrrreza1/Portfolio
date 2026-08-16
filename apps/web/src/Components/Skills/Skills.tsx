"use client";

import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";
import { SkillCategory } from "./Types";

const Skills = ({
  title,
  skills,
}: {
  readonly title: string;
  readonly skills: readonly SkillCategory[];
}) => {
  return (
    <section
      className="Container my-10 border p-2 backdrop-blur-sm"
      id="skills"
    >
      <ScrambleText text={title} className="ml-3 text-3xl" speed={30} />
      <Devider />

      <p className="px-1 text-justify text-lg leading-7 md:px-4 lg:px-6">
        As a frontend developer, I adapt my choice of technologies based on each
        {" project's goals and requirements."} By leveraging different tools and
        frameworks, I aim to deliver the most efficient and effective solutions
        possible.
      </p>

      <div className="my-6 space-y-3 px-1 md:px-4 lg:px-6">
        {skills.map((category) => (
          <div key={category.id} className="bg-surface p-5 shadow">
            <h3 className="text-text mb-3 text-xl font-semibold">
              {category.category}
            </h3>
            <div className="flex flex-wrap gap-2">
              {category.items.map((skill, index) => (
                <span
                  key={index}
                  className="border-border bg-surface text-text border px-3 py-1 text-sm font-medium"
                >
                  {skill.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Skills;

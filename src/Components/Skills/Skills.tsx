"use client";

import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";
import db from "@/DataBase/db.json";
import { getTextColor } from "@/Utils/getTextColor";

interface SkillItem {
  name: string;
  color: string;
}

interface SkillCategory {
  id: number;
  category: string;
  items: SkillItem[];
}

const Skills = () => {
  const skills = db.skills as SkillCategory[];

  return (
    <section className="Container backdrop-blur-sm p-2 border my-10">
      <ScrambleText
        text="Skills"
        className="text-3xl ml-3"
        delayBeforeFix={1000}
      />
      <Devider />

      <p className="px-6 leading-7 text-justify text-lg">
        As a frontend developer, I adapt my choice of technologies based on each
        project's goals and requirements. By leveraging different tools and
        frameworks, I aim to deliver the most efficient and effective solutions
        possible.
      </p>

      <div className="space-y-6 px-6 my-6">
        {skills.map((category) => (
          <div key={category.id} className="bg-secondary/60 shadow p-5">
            <h3 className="text-xl font-semibold mb-3 text-primary">
              {category.category}
            </h3>
            <div className="flex flex-wrap gap-2">
              {category.items.map((skill, index) => (
                <span
                  key={index}
                  className="px-3 py-1 text-sm font-medium border"
                  style={{
                    backgroundColor: skill.color,
                    color: getTextColor(skill.color),
                    borderColor: skill.color,
                  }}
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

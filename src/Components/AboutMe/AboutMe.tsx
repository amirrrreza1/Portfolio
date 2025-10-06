"use client";

import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";
import { getAge } from "@/Utils/Age";
import { B, I } from "../UI/TextArea/TextArea";

const AboutMe = () => {
  const age = getAge();

  return (
    <section className="Container backdrop-blur-sm p-2 my-10 border" id="about">
      <ScrambleText text="About Me" className="text-3xl ml-3" speed={30} />
      <Devider />

      <p className="px-1 md:px-4 lg:px-6 leading-7 text-justify text-lg">
        Hello, I’m <B>Amirreza Azarioun</B>, {age} years old, based in Tehran,
        Iran. I currently work as a <B>frontend developer</B>, but I have a
        strong passion for continuous learning and expanding my knowledge into
        other areas of software development.
      </p>

      <p className="px-1 md:px-4 lg:px-6 my-4 leading-7 text-justify text-lg">
        I focus on writing <B>scalable, clean, and maintainable code</B> —with
        thoughtful component architecture, clear naming, and strong attention to
        UX details. My day‑to‑day toolkit includes{" "}
        <B>TypeScript, React, Next.js (App Router),</B> and <B>Tailwind CSS</B>.
        I also leverage <I>artificial intelligence tools</I> to accelerate
        development, improve code quality, and streamline workflows.{" "}
      </p>
    </section>
  );
};

export default AboutMe;

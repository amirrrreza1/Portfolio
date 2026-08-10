import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";
import { getAge } from "@/Utils/Age";
import { B, I } from "../UI/TextArea/TextArea";

/**
 * Server component. It holds no state and uses no hooks; the interactive parts
 * (`ScrambleText`, `B`, `I`) are client components rendered from here.
 *
 * This is what lets the age be computed from a server-only environment value
 * instead of one inlined into the client bundle. The prose itself becomes a
 * `PageSection` record in M7.
 */
const AboutMe = () => {
  const age = getAge();

  return (
    <section className="Container my-10 border p-2 backdrop-blur-sm" id="about">
      <ScrambleText text="About Me" className="ml-3 text-3xl" speed={30} />
      <Devider />

      <p className="px-1 text-justify text-lg leading-7 md:px-4 lg:px-6">
        Hello, I’m <B>Amirreza Azarioun</B>
        {/* An unset or malformed BIRTH_DATE drops the clause rather than
            rendering an empty gap before "years old". */}
        {age === null ? "" : `, ${age} years old`}, based in Tehran, Iran. I
        currently work as a <B>frontend developer</B>, but I have a strong
        passion for continuous learning and expanding my knowledge into other
        areas of software development.
      </p>

      <p className="my-4 px-1 text-justify text-lg leading-7 md:px-4 lg:px-6">
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

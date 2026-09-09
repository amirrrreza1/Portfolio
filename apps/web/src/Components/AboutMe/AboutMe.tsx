import ScrambleText from "../UI/ScrumbleText/ScrumbleText";
import Devider from "../UI/Devider/Devider";
import InlineMarkdown from "../UI/InlineMarkdown/InlineMarkdown";
import type { PublicPageSection } from "@portfolio/contracts/portfolio";

type AboutSection = Extract<PublicPageSection, { readonly key: "about" }>;

/**
 * Server component. It holds no state and uses no hooks; the interactive parts
 * (`ScrambleText`, `B`, `I`) are client components rendered from here.
 *
 * The API has already derived the age from the private database date and
 * validated the inline Markdown. No birth date or raw HTML reaches this view.
 */
const AboutMe = ({ section }: { readonly section: AboutSection }) => {
  return (
    <section className="Container my-10 border p-2 backdrop-blur-sm" id="about">
      <ScrambleText text="About Me" className="ml-3 text-3xl" speed={30} />
      <Devider />
      {section.content.body.map((paragraph, index) => (
        <p
          key={`${section.key}-${index}`}
          className={`${index === 0 ? "" : "my-4"} px-1 text-justify text-lg leading-7 md:px-4 lg:px-6`}
        >
          <InlineMarkdown source={paragraph} />
        </p>
      ))}
    </section>
  );
};

export default AboutMe;

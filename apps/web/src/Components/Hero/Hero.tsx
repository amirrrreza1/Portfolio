"use client";

import RubikCube from "../RubikCube/RubikCube";
import CodeStyleText from "../UI/CodeTyleText/CodeTyleText";
import { useReducedMotion } from "@/Contexts/ThemeContext";
import InlineMarkdown from "../UI/InlineMarkdown/InlineMarkdown";
import type { PublicPageSection } from "@portfolio/contracts/portfolio";

type HeroSection = Extract<PublicPageSection, { readonly key: "hero" }>;

const Hero = ({ section }: { readonly section: HeroSection }) => {
  const reducedMotion = useReducedMotion();
  const { content } = section;
  return (
    <>
      <main
        className="Container flex h-screen flex-col items-center justify-center gap-5 lg:flex-row"
        id="home"
      >
        <section className="h-fit lg:w-1/2">
          <div className="flex w-full flex-col items-start justify-center gap-4 rounded p-2">
            <CodeStyleText
              strings={content.lines}
              typingSpeed={content.typingSpeed ?? 50}
              deletingSpeed={content.deletingSpeed ?? 30}
              className="min-w-[270px] text-xl md:text-2xl lg:text-3xl"
              pauseBetween={content.pauseBetween ?? 3000}
            />
            {content.subtitle === undefined ? null : (
              <p className="text-sm lg:text-center lg:text-lg">
                <InlineMarkdown source={content.subtitle} />
              </p>
            )}
          </div>
        </section>
        {content.showRubikCube === false ? null : (
          <section className="flex h-[300px] w-full items-end justify-center lg:w-1/2">
            {reducedMotion ? (
              <div className="border-border flex aspect-square h-full max-h-[300px] w-full max-w-[300px] items-center justify-center border text-sm">
                Interactive cube disabled for reduced motion
              </div>
            ) : (
              <RubikCube />
            )}
          </section>
        )}
      </main>
    </>
  );
};

export default Hero;

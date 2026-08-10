"use client";

import RubikCube from "../RubikCube/RubikCube";
import CodeStyleText from "../UI/CodeTyleText/CodeTyleText";
import { useReducedMotion } from "@/Contexts/ThemeContext";

const Hero = () => {
  const reducedMotion = useReducedMotion();
  return (
    <>
      <main
        className="Container flex h-screen flex-col items-center justify-center gap-5 lg:flex-row"
        id="home"
      >
        <section className="h-fit lg:w-1/2">
          <div className="flex w-full flex-col items-start justify-center gap-4 rounded p-2">
            <CodeStyleText
              strings={["Hello There!", "I'm Amirreza Azarioun"]}
              typingSpeed={50}
              deletingSpeed={30}
              className="min-w-[270px] text-xl md:text-2xl lg:text-3xl"
              pauseBetween={3000}
            />
            <p className="text-sm lg:text-center lg:text-lg">
              A Developer / Student / Learner
            </p>
          </div>
        </section>
        <section className="flex h-[300px] w-full items-end justify-center lg:w-1/2">
          {reducedMotion ? (
            <div className="border-secondary/40 flex aspect-square h-full max-h-[300px] w-full max-w-[300px] items-center justify-center border text-sm">
              Interactive cube disabled for reduced motion
            </div>
          ) : (
            <RubikCube />
          )}
        </section>
      </main>
    </>
  );
};

export default Hero;

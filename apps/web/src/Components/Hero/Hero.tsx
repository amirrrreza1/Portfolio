"use client";

import RubikCube from "../RubikCube/RubikCube";
import CodeStyleText from "../UI/CodeTyleText/CodeTyleText";
import Button from "../UI/Buttons/CustomBTN";
import { useReducedMotion } from "@/Contexts/ThemeContext";
import { localePath } from "@/i18n/routing";
import type { Locale } from "@portfolio/contracts/common";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

const HERO_LINES = ["Hello There!", "I am Amirreza Azarioun"];
const HERO_SUBTITLE = "A Developer / Student / Learner";

const Hero = ({ locale }: { readonly locale: Locale }) => {
  const reducedMotion = useReducedMotion();
  return (
    <>
      <main
        className="Container grid min-h-screen grid-cols-1 content-center items-center gap-5 py-20 lg:h-screen lg:grid-cols-2 lg:grid-rows-[auto_auto] lg:py-0"
        id="home"
      >
        <section className="h-fit w-full text-center lg:col-start-1 lg:row-start-1 lg:self-end lg:text-left">
          <div className="mx-auto flex w-fit max-w-full flex-col items-center justify-center gap-4 rounded p-2 backdrop-blur-sm lg:mx-0 lg:items-start">
            <CodeStyleText
              strings={HERO_LINES}
              typingSpeed={50}
              deletingSpeed={30}
              className="inline-block min-h-7 min-w-[270px] text-xl leading-7 whitespace-nowrap md:min-h-8 md:text-2xl md:leading-8 lg:min-h-9 lg:text-3xl lg:leading-9"
              pauseBetween={3000}
            />
            <p className="text-sm lg:text-center lg:text-lg">{HERO_SUBTITLE}</p>
          </div>
        </section>
        <section className="flex h-[300px] w-full items-end justify-center lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {reducedMotion ? (
            <div className="border-border flex aspect-square h-full max-h-[300px] w-full max-w-[300px] items-center justify-center border text-sm">
              Interactive cube disabled for reduced motion
            </div>
          ) : (
            <RubikCube />
          )}
        </section>
        <Button
          asChild
          size="sm"
          className="mt-2 justify-self-center focus-visible:ring-2 focus-visible:outline-none lg:col-start-1 lg:row-start-2 lg:ml-2 lg:self-start lg:justify-self-start"
        >
          <Link href={localePath(locale, "blog")}>
            <span className="inline-flex items-center gap-2">
              Read the Blog
              <ArrowUpRight
                aria-hidden="true"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </span>
          </Link>
        </Button>
      </main>
    </>
  );
};

export default Hero;

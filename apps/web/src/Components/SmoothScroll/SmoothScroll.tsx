"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollSmoother, ScrollTrigger);

export const scrollToSection = (id: string) => {
  const smoother = ScrollSmoother.get();
  if (!smoother) return false;
  const target = document.querySelector(id);
  if (!target) return false;
  const targetY = target.getBoundingClientRect().top + window.scrollY;
  const headerOffset = 90;
  smoother.scrollTo(targetY - headerOffset, true);
  return true;
};

const SmoothScroll = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (ScrollSmoother.get()) return;

    ScrollSmoother.create({
      wrapper: "#smooth-wrapper",
      content: "#smooth-content",
      smooth: 1.2,
      effects: true,
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const smoother = ScrollSmoother.get();
    if (smoother) {
      smoother.scrollTo(0, false);
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [pathname]);

  return (
    <div id="smooth-wrapper">
      <div id="smooth-content">{children}</div>
    </div>
  );
};

export default SmoothScroll;

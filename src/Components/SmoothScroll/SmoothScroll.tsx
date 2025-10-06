"use client";

import React, { useEffect } from "react";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollSmoother, ScrollTrigger);

export const scrollToSection = (id: string) => {
  const smoother = ScrollSmoother.get();
  if (!smoother) return;
  const target = document.querySelector(id);
  if (!target) return;
  const targetY = target.getBoundingClientRect().top + window.scrollY;
  const headerOffset = 90;
  smoother.scrollTo(targetY - headerOffset, true);
};

const SmoothScroll = ({ children }: { children: React.ReactNode }) => {
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

  return (
    <div id="smooth-wrapper">
      <div id="smooth-content">{children}</div>
    </div>
  );
};

export default SmoothScroll;

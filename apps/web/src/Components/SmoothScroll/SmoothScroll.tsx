"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollSmoother, ScrollTrigger);

export const scrollToSection = (id: string) => {
  const rawId = id.startsWith("#") ? id.slice(1) : id;
  let decodedId = rawId;
  try {
    decodedId = decodeURIComponent(rawId);
  } catch {
    // A malformed escape cannot match an authored heading ID.
  }
  const target = document.getElementById(decodedId);
  if (!target) return false;

  // Native hash navigation scrolls the fixed wrapper instead of GSAP's scroll
  // position. Once those values diverge, wheel input cannot return to the top.
  // Collapse that accidental secondary position before moving through the one
  // scroll controller the page owns.
  const wrapper = document.getElementById("smooth-wrapper");
  if (wrapper !== null) wrapper.scrollTop = 0;

  const motion = document.documentElement.dataset.motion;
  const animate =
    motion === "full" ||
    (motion !== "reduced" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const smoother = ScrollSmoother.get();
  if (!smoother) {
    target.scrollIntoView({
      behavior: animate ? "smooth" : "auto",
      block: "start",
    });
    return true;
  }

  smoother.scrollTo(target, animate, "top 90px");
  return true;
};

const isArticleRoute = (pathname: string) =>
  /^\/(?:en|fa)\/blog\/[^/]+\/?$/.test(pathname);

const SmoothScroll = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Long-form reading routes use native document scrolling. Native hash
    // navigation and ScrollSmoother both try to own the fixed wrapper, and a
    // contents jump can leave its scrollTop detached from GSAP's position.
    // Killing the smoother here preserves reliable wheel, keyboard, scrollbar,
    // back/forward, and direct-hash behavior throughout an article.
    if (isArticleRoute(pathname)) {
      ScrollSmoother.get()?.kill();
      return;
    }

    if (ScrollSmoother.get()) return;

    ScrollSmoother.create({
      wrapper: "#smooth-wrapper",
      content: "#smooth-content",
      smooth: 1.2,
      effects: true,
    });
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isArticleRoute(pathname) && window.location.hash.length > 1) return;

    const smoother = ScrollSmoother.get();
    const wrapper = document.getElementById("smooth-wrapper");
    if (wrapper !== null) wrapper.scrollTop = 0;
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

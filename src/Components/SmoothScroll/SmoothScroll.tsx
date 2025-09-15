"use client";

import React, { useEffect, useRef } from "react";

const SmoothScroll = ({ children }: { children: React.ReactNode }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const LocomotiveScroll = require("locomotive-scroll").default;

    const scroll = new LocomotiveScroll({
      el: scrollRef.current!,
      smooth: true,
      lerp: 0.08,
      multiplier: 1.2,
      class: "is-reveal",
    });

    return () => scroll.destroy();
  }, []);

  return (
    <div id="scroll-container" data-scroll-container ref={scrollRef}>
      {children}
    </div>
  );
};

export default SmoothScroll;

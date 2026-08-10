"use client";

import React from "react";

import CustomCursor from "../UI/Custom/Cursor";
import { CodeParticlesBackground } from "./Background/CodeParticlesBackground";
import SmoothScroll from "../SmoothScroll/SmoothScroll";
import { useReducedMotion } from "@/Contexts/ThemeContext";

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const reducedMotion = useReducedMotion();
  const content = <main>{children}</main>;

  return (
    <React.Fragment>
      {!reducedMotion && <CustomCursor />}
      {!reducedMotion && <CodeParticlesBackground />}
      {reducedMotion ? content : <SmoothScroll>{content}</SmoothScroll>}
    </React.Fragment>
  );
};

export default MainLayout;

"use client";

import React from "react";

import CustomCursor from "../UI/Custom/Cursor";
import { CodeParticlesBackground } from "./Background/CodeParticlesBackground";
import SmoothScroll from "../SmoothScroll/SmoothScroll";
import { useReducedMotion } from "@/Contexts/ThemeContext";
import PageReadyLoader from "../PageLoader/PageReadyLoader";

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const reducedMotion = useReducedMotion();
  const content = <div className="min-h-dvh">{children}</div>;

  return (
    <React.Fragment>
      <PageReadyLoader />
      {!reducedMotion && <CustomCursor />}
      {!reducedMotion && <CodeParticlesBackground />}
      {reducedMotion ? content : <SmoothScroll>{content}</SmoothScroll>}
    </React.Fragment>
  );
};

export default MainLayout;

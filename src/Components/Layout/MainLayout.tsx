"use client";

import React from "react";

import Footer from "./Footer/Footer";
import Header from "./Header/Header";
import CustomCursor from "../UI/Custom/Cursor";
import { CodeParticlesBackground } from "./Background/CodeParticlesBackground";
import SmoothScroll from "../SmoothScroll/SmoothScroll";

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <React.Fragment>
      <CustomCursor />
      <CodeParticlesBackground />
      <SmoothScroll>
        <main>{children}</main>
      </SmoothScroll>
    </React.Fragment>
  );
};

export default MainLayout;

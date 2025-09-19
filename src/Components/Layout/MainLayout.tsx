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
      <Header />
      <CodeParticlesBackground />
      <SmoothScroll>
        <main>{children}</main>
        <Footer />
      </SmoothScroll>
    </React.Fragment>
  );
};

export default MainLayout;

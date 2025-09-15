import React from "react";
import Footer from "./Footer/Footer";
import Header from "./Header/Header";
import CustomCursor from "../UI/Custom/Cursor";
import { CodeParticlesBackground } from "./Background/CodeParticlesBackground";

const MainLayout = ({ children }: any) => {
  return (
    <React.Fragment>
      <CustomCursor />
      <Header />
      <CodeParticlesBackground />
      <main data-scroll-section>{children}</main>
      <Footer />
    </React.Fragment>
  );
};

export default MainLayout;

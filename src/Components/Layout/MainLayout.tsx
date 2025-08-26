import React from "react";
import Footer from "./Footer/Footer";
import Header from "./Header/Header";
import CustomCursor from "../UI/Custom/Cursor";

const MainLayout = ({ children }: any) => {
  return (
    <React.Fragment>
      <CustomCursor />
      <Header />
      <main>{children}</main>
      {/* <Footer /> */}
    </React.Fragment>
  );
};

export default MainLayout;

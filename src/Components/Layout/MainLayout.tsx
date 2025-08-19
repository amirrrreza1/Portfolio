import React from "react";
import Footer from "./Footer/Footer";
import Header from "./Header/Header";
import CustomCursor from "../UI/Custom/Cursor";

const MainLayout = ({ children }: any) => {
  return (
    <React.Fragment>
      <CustomCursor />
      <Header />
      <div className="flex flex-col min-h-[calc(100vh-44px)]">
        <main className="flex-1">{children}</main>
      </div>
      <Footer />
    </React.Fragment>
  );
};

export default MainLayout;

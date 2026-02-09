import Footer from "@/Components/Layout/Footer/Footer";
import React from "react";

const Layout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  return (
    <>
      <main className="min-h-[calc(100dvh-56px)]">{children}</main>
      <Footer />
    </>
  );
};

export default Layout;

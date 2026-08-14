import Footer from "@/Components/Layout/Footer/Footer";
import { getLegacySiteData } from "@/server/legacy-portfolio";
import React from "react";

const Layout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  const site = getLegacySiteData("en");
  return (
    <>
      <main className="min-h-[calc(100dvh-56px)]">{children}</main>
      <Footer
        locale="en"
        settings={site.settings}
        socialLinks={site.socialLinks}
      />
    </>
  );
};

export default Layout;

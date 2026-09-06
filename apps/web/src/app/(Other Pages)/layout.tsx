import React from "react";

const Layout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  // This route group contains redirect-only legacy URLs. Their canonical
  // locale routes own all visible chrome and data reads.
  return children;
};

export default Layout;

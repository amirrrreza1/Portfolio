import Footer from "@/Components/Layout/Footer/Footer";
import Header from "@/Components/Layout/Header/Header";
import { getLegacySiteData } from "@/server/legacy-portfolio";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const site = getLegacySiteData("en");
  return (
    <>
      <Header locale="en" navigation={site.navigation} />
      <main>{children}</main>
      <Footer
        locale="en"
        settings={site.settings}
        socialLinks={site.socialLinks}
      />
    </>
  );
}

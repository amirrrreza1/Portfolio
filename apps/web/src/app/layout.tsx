import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/Contexts/ThemeContext";
import MainLayout from "@/Components/Layout/MainLayout";
import { ToastProvider } from "@/Components/Toast/Toast";
import { getSiteUrl } from "@/Utils/siteUrl";
import { getLocaleDefinition, isLocale } from "@portfolio/contracts/common";
import { headers } from "next/headers";

export const metadata: Metadata = {
  // Without an absolute base, Next.js resolves every relative metadata URL
  // against localhost. These values move into SiteSettings in M7; the base
  // itself stays an environment concern because it differs per deployment.
  metadataBase: getSiteUrl(),
  title: "Amirreza Azarioun",
  description: "Amirreza Azarioun's portfolio site",
  keywords: [
    "Amirreza Azarioun",
    "Portfolio",
    "Web Developer",
    "Frontend",
    "React",
    "Next.js",
    "JavaScript",
    "TypeScript",
  ],
  authors: [{ name: "Amirreza Azarioun" }],
  creator: "Amirreza Azarioun",
  publisher: "Amirreza Azarioun",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const localeHeader = (await headers()).get("x-portfolio-locale");
  const locale = isLocale(localeHeader) ? localeHeader : "en";
  const definition = getLocaleDefinition(locale);

  return (
    <html lang={definition.bcp47} dir={definition.direction}>
      <body>
        <ThemeProvider>
          <ToastProvider>
            <MainLayout>{children}</MainLayout>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

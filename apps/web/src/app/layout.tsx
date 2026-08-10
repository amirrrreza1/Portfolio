import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/Contexts/ThemeContext";
import MainLayout from "@/Components/Layout/MainLayout";
import { ToastProvider } from "@/Components/Toast/Toast";
import { getSiteUrl } from "@/Utils/siteUrl";
import { getLocaleDefinition, isLocale } from "@portfolio/contracts/common";
import {
  type AppearanceSettings,
  appearanceRootAttributes,
  parseAppearanceCookie,
  PREFERENCES_COOKIE_NAME,
  resolveAppearance,
} from "@portfolio/contracts/appearance";
import { cookies, headers } from "next/headers";
import Script from "next/script";

// M7 persists this singleton and lets the owner control its allowlist. Until
// then, keep the same validated shape here rather than trusting a cookie value
// directly in the document shell.
const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  enabledThemes: ["dark", "light"],
  defaultTheme: "dark",
  enabledBlogFonts: ["jetbrains-mono", "vazir-code", "system-sans"],
  defaultBlogFontByLocale: { en: "jetbrains-mono", fa: "vazir-code" },
  allowedBlogSizeSteps: ["sm", "md", "lg", "xl"],
  defaultBlogSizeStep: "md",
  offerMotionToggle: true,
};

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
  const requestHeaders = await headers();
  const localeHeader = requestHeaders.get("x-portfolio-locale");
  const nonce = requestHeaders.get("x-portfolio-csp-nonce") ?? undefined;
  const locale = isLocale(localeHeader) ? localeHeader : "en";
  const definition = getLocaleDefinition(locale);
  const preferenceCookie = (await cookies()).get(PREFERENCES_COOKIE_NAME);
  const appearance = resolveAppearance(
    parseAppearanceCookie(preferenceCookie?.value),
    DEFAULT_APPEARANCE_SETTINGS,
    locale
  );
  const defaultAppearance = resolveAppearance(
    null,
    DEFAULT_APPEARANCE_SETTINGS,
    locale
  );

  return (
    <html
      suppressHydrationWarning
      lang={definition.bcp47}
      dir={definition.direction}
      {...appearanceRootAttributes(appearance)}
    >
      <head>
        <Script id="system-theme" nonce={nonce} strategy="beforeInteractive">
          {`(function(){var r=document.documentElement;if(r.dataset.theme!=="system")return;var q=window.matchMedia("(prefers-color-scheme: dark)");var a=function(){r.dataset.systemTheme=q.matches?"dark":"light"};a();q.addEventListener("change",a)})()`}
        </Script>
      </head>
      <body>
        <ThemeProvider
          initialAppearance={appearance}
          defaultAppearance={defaultAppearance}
        >
          <ToastProvider>
            <MainLayout>{children}</MainLayout>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/Contexts/ThemeContext";
import MainLayout from "@/Components/Layout/MainLayout";
import { ToastProvider } from "@/Components/Toast/Toast";
import { getSiteUrl } from "@/Utils/siteUrl";
import { getPortfolioAppearance } from "@/server/portfolio-appearance";
import { PublicDataUnavailableError } from "@/server/public-api-client";
import { getLocaleDefinition, isLocale } from "@portfolio/contracts/common";
import { getMessages } from "@/i18n/messages";
import {
  appearanceRootAttributes,
  parseAppearanceCookie,
  PREFERENCES_COOKIE_NAME,
  resolvePublicAppearance,
} from "@portfolio/contracts/appearance";
import { cookies, headers } from "next/headers";
import Script from "next/script";

import { SITE_FONT_PRELOAD_HREF } from "@/server/font-delivery";
import { isAdminPath } from "@/server/admin-routes";

export const metadata: Metadata = {
  // The deployment origin remains an environment concern. All authored SEO
  // copy is supplied by the locale layout from persisted SiteSettings.
  metadataBase: getSiteUrl(),
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

  // The admin panel shares this file only because Next allows one root layout
  // per application. It shares nothing else: no appearance read, no theme
  // provider, no site chrome, and no visitor font preference. That is
  // deliberate on three counts — the panel must stay reachable while the
  // public API is down, blog typography must not restyle admin UI
  // (PRODUCT_SPEC.md §4), and an admin document that renders no public
  // component cannot inherit a public component's inline script.
  if (isAdminPath(requestHeaders.get("x-portfolio-pathname") ?? "")) {
    return (
      <html lang="en" dir="ltr" data-theme="dark" data-surface="admin">
        <body>{children}</body>
      </html>
    );
  }

  const localeHeader = requestHeaders.get("x-portfolio-locale");
  const nonce = requestHeaders.get("x-portfolio-csp-nonce") ?? undefined;
  const locale = isLocale(localeHeader) ? localeHeader : "en";
  const definition = getLocaleDefinition(locale);
  const messages = getMessages(locale);
  let appearanceSettings;
  try {
    appearanceSettings = await getPortfolioAppearance(locale);
  } catch (error) {
    if (!(error instanceof PublicDataUnavailableError)) throw error;
  }

  if (appearanceSettings === undefined) {
    return (
      <html
        suppressHydrationWarning
        lang={definition.bcp47}
        dir={definition.direction}
        data-theme="dark"
        data-motion="system"
      >
        <body>
          <main className="Container my-20 border p-8 text-center" role="alert">
            <h1 className="text-2xl font-semibold">
              {messages.common.siteUnavailable}
            </h1>
          </main>
        </body>
      </html>
    );
  }

  const preferenceCookie = (await cookies()).get(PREFERENCES_COOKIE_NAME);
  const appearance = resolvePublicAppearance(
    parseAppearanceCookie(preferenceCookie?.value),
    appearanceSettings
  );
  const defaultAppearance = resolvePublicAppearance(null, appearanceSettings);

  return (
    <html
      suppressHydrationWarning
      lang={definition.bcp47}
      dir={definition.direction}
      {...appearanceRootAttributes(appearance)}
    >
      <head>
        {/*
          The site font's critical variant, and the only font this layout may
          preload — THEMING.md §4. An optional blog family is preloaded by the
          article route instead, so a non-blog route never downloads one.
        */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href={SITE_FONT_PRELOAD_HREF}
          crossOrigin="anonymous"
        />
        <Script id="system-theme" nonce={nonce} strategy="beforeInteractive">
          {`(function(){var r=document.documentElement;if(r.dataset.theme!=="system")return;var q=window.matchMedia("(prefers-color-scheme: dark)");var a=function(){r.dataset.systemTheme=q.matches?"dark":"light"};a();q.addEventListener("change",a)})()`}
        </Script>
      </head>
      <body>
        <ThemeProvider
          initialAppearance={appearance}
          defaultAppearance={defaultAppearance}
          appearanceOptions={appearanceSettings}
        >
          <ToastProvider>
            <MainLayout>{children}</MainLayout>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

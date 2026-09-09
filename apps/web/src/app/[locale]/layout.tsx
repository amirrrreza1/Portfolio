import Footer from "@/Components/Layout/Footer/Footer";
import Header from "@/Components/Layout/Header/Header";
import { getPortfolioSite } from "@/server/portfolio-site";
import { PublicDataUnavailableError } from "@/server/public-api-client";
import { getLocaleDefinition, isLocale } from "@portfolio/contracts/common";
import { notFound } from "next/navigation";
import { getMessages } from "@/i18n/messages";
import type { Metadata } from "next";

// This locale shell reads request-time public data. Keep the same explicit
// blocking boundary as the root shell so Cache Components does not require a
// loading fallback around the entire portfolio during legacy rollback.
export const instant = false;

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  try {
    const site = await getPortfolioSite("en");
    const settings = site.settings;
    return {
      metadataBase: new URL(settings.canonicalSiteUrl),
      title: {
        default: settings.siteName,
        template: settings.titleTemplate,
      },
      description: settings.metaDescription,
      keywords: settings.keywords,
      authors: [{ name: settings.authorName }],
      creator: settings.creatorName,
      publisher: settings.publisherName,
      robots: settings.robotsAllowIndexing
        ? { index: true, follow: true }
        : { index: false, follow: false },
      verification: {
        google: settings.siteVerification.google ?? undefined,
        other:
          settings.siteVerification.bing === null
            ? undefined
            : { "msvalidate.01": settings.siteVerification.bing },
      },
    };
  } catch (error) {
    if (!(error instanceof PublicDataUnavailableError)) throw error;
    return { robots: { index: false, follow: false } };
  }
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const definition = getLocaleDefinition(locale);
  const messages = getMessages("en");
  let site;
  try {
    site = await getPortfolioSite("en");
  } catch (error) {
    if (!(error instanceof PublicDataUnavailableError)) throw error;
  }

  if (site === undefined) {
    return (
      <main className="Container my-20 border p-8 text-center" role="alert">
        <h1 className="text-2xl font-semibold">
          {messages.common.siteUnavailable}
        </h1>
      </main>
    );
  }

  return (
    <div data-content-locale={locale} className="flex min-h-dvh flex-col">
      <Header locale="en" />
      <main
        lang={definition.bcp47}
        dir={definition.direction}
        className="flex-1"
      >
        {children}
      </main>
      <Footer
        locale="en"
        settings={site.settings}
        socialLinks={site.socialLinks}
      />
    </div>
  );
}

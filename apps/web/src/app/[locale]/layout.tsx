import Footer from "@/Components/Layout/Footer/Footer";
import Header from "@/Components/Layout/Header/Header";
import { getPortfolioSite } from "@/server/portfolio-site";
import { PublicDataUnavailableError } from "@/server/public-api-client";
import { getLocaleDefinition, isLocale } from "@portfolio/contracts/common";
import { notFound } from "next/navigation";
import { getMessages } from "@/i18n/messages";

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
  const messages = getMessages(locale);
  let site;
  try {
    site = await getPortfolioSite(locale);
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
    <div
      lang={definition.bcp47}
      dir={definition.direction}
      data-locale={locale}
    >
      <Header locale={locale} navigation={site.navigation} />
      <main>{children}</main>
      <Footer
        locale={locale}
        settings={site.settings}
        socialLinks={site.socialLinks}
      />
    </div>
  );
}

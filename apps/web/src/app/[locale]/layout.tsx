import Footer from "@/Components/Layout/Footer/Footer";
import Header from "@/Components/Layout/Header/Header";
import { getLocaleDefinition, isLocale } from "@portfolio/contracts/common";
import { notFound } from "next/navigation";

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
  return (
    <div
      lang={definition.bcp47}
      dir={definition.direction}
      data-locale={locale}
    >
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}

import { LOCALES, isLocale } from "@portfolio/contracts/common";
import { notFound } from "next/navigation";

import HomePage from "@/features/home/HomePage";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleHomePage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <HomePage locale={locale} />;
}

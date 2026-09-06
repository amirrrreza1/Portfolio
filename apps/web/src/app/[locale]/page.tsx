import { LOCALES, isLocale } from "@portfolio/contracts/common";
import { notFound } from "next/navigation";

import HomePage from "@/features/home/HomePage";

// The legacy rollback reader derives current age at request time. This page is
// therefore intentionally blocking rather than an instant prerender shell.
export const instant = false;

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

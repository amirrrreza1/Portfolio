import type { Locale } from "@portfolio/contracts/common";

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(
    value
  );
}

export function formatPublicDate(value: string, locale: Locale): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(
    locale === "fa" ? "fa-IR-u-ca-persian" : "en-US",
    { dateStyle: "medium", timeZone: "UTC" }
  ).format(date);
}

export function formatPublicTimestamp(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(
    locale === "fa" ? "fa-IR-u-ca-persian" : "en-US",
    { dateStyle: "medium", timeZone: "UTC" }
  ).format(date);
}

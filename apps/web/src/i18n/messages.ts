import type { Locale } from "@portfolio/contracts/common";

import en from "./messages/en.json";
import fa from "./messages/fa.json";

type CatalogShape<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : CatalogShape<T[K]>;
};

export type Messages = CatalogShape<typeof en>;

// Only blog-specific copy is localized. Shared chrome and every portfolio
// surface deliberately inherit the English catalog.
const faMessages: Messages = {
  ...en,
  blog: fa.blog,
};

export const messageCatalogs: Readonly<Record<Locale, Messages>> = {
  en,
  fa: faMessages,
};

export function getMessages(locale: Locale): Messages {
  return messageCatalogs[locale];
}

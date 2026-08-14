import type { Locale } from "@portfolio/contracts/common";

import en from "./messages/en.json";
import fa from "./messages/fa.json";

type CatalogShape<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : CatalogShape<T[K]>;
};

export type Messages = CatalogShape<typeof en>;

// Missing Persian groups or keys fail the TypeScript build here. Exact key
// parity, non-empty values, and the no-HTML rule are also checked at runtime.
const faMessages: Messages = fa;

export const messageCatalogs: Readonly<Record<Locale, Messages>> = {
  en,
  fa: faMessages,
};

export function getMessages(locale: Locale): Messages {
  return messageCatalogs[locale];
}

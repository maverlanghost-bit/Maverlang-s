"use client";

import { en } from "@/content/i18n/en";
import { esCL, type Messages } from "@/content/i18n/es-CL";
import { useDisplayCurrency, useDisplayLanguage } from "@/lib/hooks/use-display-currency";
import type { Currency, Preferences } from "@/lib/types";

const dictionaries: Record<Preferences["language"], Messages> = {
  "es-CL": esCL,
  en,
};

/** Textos, idioma y moneda única (M40). Sin preferencias, es-CL y CLP. */
export function useT(): {
  t: Messages;
  language: Preferences["language"];
  currency: Currency;
} {
  const language = useDisplayLanguage();
  const currency = useDisplayCurrency();
  return { t: dictionaries[language], language, currency };
}

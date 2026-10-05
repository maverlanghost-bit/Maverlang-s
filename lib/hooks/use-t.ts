"use client";

import { en } from "@/content/i18n/en";
import { esCL, type Messages } from "@/content/i18n/es-CL";
import { usePrefs } from "@/lib/hooks/queries";
import type { Currency, Preferences } from "@/lib/types";

const dictionaries: Record<Preferences["language"], Messages> = {
  "es-CL": esCL,
  en,
};

/** Textos, idioma y moneda de visualización. Sin preferencias, es-CL y CLP. */
export function useT(): {
  t: Messages;
  language: Preferences["language"];
  currency: Currency;
} {
  const prefs = usePrefs();
  const language = prefs.data?.language ?? "es-CL";
  const currency = prefs.data?.displayCurrency ?? "CLP";
  return { t: dictionaries[language], language, currency };
}

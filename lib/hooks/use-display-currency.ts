"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useSession } from "@/lib/auth/session-context";
import { usePrefs } from "@/lib/hooks/queries";
import { useUpdatePrefs } from "@/lib/hooks/use-update-prefs";
import {
  readStoredCurrency,
  resolveDisplayCurrency,
  writeStoredCurrency,
} from "@/lib/preferences/currency";
import type { Currency, Preferences } from "@/lib/types";

const EVENT = "mv-currency";
const LANG_KEY = "mv_language";
const LANG_EVENT = "mv-language";

let cachedCurrency: Currency | null | undefined;
const currencyListeners = new Set<() => void>();
let cachedLanguage: Preferences["language"] | null | undefined;
const languageListeners = new Set<() => void>();

function emit(set: Set<() => void>) {
  for (const listener of set) listener();
}

function readLocalCurrency(): Currency | null {
  const stored = readStoredCurrency();
  if (cachedCurrency === undefined || cachedCurrency !== stored) cachedCurrency = stored;
  return cachedCurrency ?? null;
}

function readLocalLanguage(): Preferences["language"] | null {
  if (typeof window === "undefined") return cachedLanguage ?? null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LANG_KEY)?.trim() ?? null;
  } catch {
    raw = null;
  }
  const value = raw === "es-CL" || raw === "en" ? raw : null;
  cachedLanguage = value;
  return value;
}

function subscribeCurrency(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === "mv_currency") {
      cachedCurrency = undefined;
      onChange();
    }
  };
  const onCustom = () => onChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onCustom);
  currencyListeners.add(onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onCustom);
    currencyListeners.delete(onChange);
  };
}

function subscribeLanguage(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === LANG_KEY) {
      cachedLanguage = undefined;
      onChange();
    }
  };
  const onCustom = () => onChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(LANG_EVENT, onCustom);
  languageListeners.add(onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onCustom);
    window.removeEventListener(LANG_EVENT, onCustom);
    languageListeners.delete(onChange);
  };
}

function serverCurrency(): Currency | null {
  return null;
}

function serverLanguage(): Preferences["language"] | null {
  return null;
}

/** Moneda guardada en este navegador (visitante). Null hasta hidratar. */
export function useLocalCurrency(): Currency | null {
  return useSyncExternalStore(subscribeCurrency, readLocalCurrency, serverCurrency);
}

/** Idioma guardado en este navegador (visitante). Null hasta hidratar. */
export function useLocalLanguage(): Preferences["language"] | null {
  return useSyncExternalStore(subscribeLanguage, readLocalLanguage, serverLanguage);
}

function setLocalCurrency(currency: Currency) {
  cachedCurrency = currency;
  writeStoredCurrency(currency);
  emit(currencyListeners);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

function setLocalLanguage(language: Preferences["language"]) {
  cachedLanguage = language;
  try {
    window.localStorage.setItem(LANG_KEY, language);
  } catch {
    // Sin almacenamiento: la UI igual cambia en memoria.
  }
  emit(languageListeners);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LANG_EVENT));
}

/** Moneda única resuelta: sesión (DB) > local > CLP. Se actualiza al instante. */
export function useDisplayCurrency(): Currency {
  const prefs = usePrefs();
  const local = useLocalCurrency();
  const fromPrefs = prefs.data?.displayCurrency ?? null;
  return resolveDisplayCurrency({ prefs: fromPrefs, stored: local });
}

/** Idioma resuelto: sesión (DB) > local > es-CL. */
export function useDisplayLanguage(): Preferences["language"] {
  const prefs = usePrefs();
  const local = useLocalLanguage();
  const fromPrefs = prefs.data?.language;
  if (fromPrefs === "es-CL" || fromPrefs === "en") return fromPrefs;
  if (local === "es-CL" || local === "en") return local;
  return "es-CL";
}

/** Cambia la moneda: con sesión va a la DB; sin sesión queda en local. Siempre local + cookie. */
export function useSetDisplayCurrency() {
  const session = useSession();
  const queryClient = useQueryClient();
  const update = useUpdatePrefs();
  return useCallback(
    (currency: Currency) => {
      setLocalCurrency(currency);
      if (session.status !== "authenticated") return;
      const base = queryClient.getQueryData<Preferences>(["prefs"]);
      if (!base) {
        // Sin prefs cargadas (visitante con sesión a medio cargar): el local ya actualizó la UI.
        return;
      }
      if (base.displayCurrency === currency) return;
      update({ displayCurrency: currency });
    },
    [queryClient, session.status, update],
  );
}

/** Cambia el idioma: con sesión va a la DB; sin sesión queda en local. */
export function useSetDisplayLanguage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const update = useUpdatePrefs();
  return useCallback(
    (language: Preferences["language"]) => {
      setLocalLanguage(language);
      if (session.status !== "authenticated") return;
      const base = queryClient.getQueryData<Preferences>(["prefs"]);
      if (!base || base.language === language) return;
      update({ language });
    },
    [queryClient, session.status, update],
  );
}

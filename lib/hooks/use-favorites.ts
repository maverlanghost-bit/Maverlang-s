"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "a24_favorites";
const EVENT = "a24-favorites";

type Stored = { v: 1; symbols: string[] };

let cachedRaw: string | null | undefined;
let cachedSymbols: string[] = [];

function isStored(value: unknown): value is Stored {
  if (!value || typeof value !== "object") return false;
  const record = value as { v?: unknown; symbols?: unknown };
  return record.v === 1 && Array.isArray(record.symbols);
}

function parse(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    const list = Array.isArray(value) ? value : isStored(value) ? value.symbols : null;
    if (!list) return [];
    const symbols: string[] = [];
    for (const item of list) {
      if (typeof item === "string" && item.length > 0 && !symbols.includes(item)) symbols.push(item);
    }
    return symbols;
  } catch {
    return [];
  }
}

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (cachedRaw !== undefined && raw === cachedRaw) return cachedSymbols;
  cachedRaw = raw;
  cachedSymbols = parse(raw);
  return cachedSymbols;
}

function write(symbols: string[]) {
  const payload = JSON.stringify({ v: 1, symbols } satisfies Stored);
  window.localStorage.setItem(KEY, payload);
  cachedRaw = payload;
  cachedSymbols = symbols;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onChange);
  };
}

function favoritesOnServer(): string[] | null {
  return null;
}

/** `null` hasta hidratar. Después, símbolos guardados en este navegador. */
export function useFavorites() {
  const symbols = useSyncExternalStore(subscribe, read, favoritesOnServer);
  const toggle = useCallback((symbol: string) => {
    const current = read();
    const next = current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol];
    try {
      write(next);
    } catch {
      return;
    }
  }, []);
  return { symbols, toggle };
}

"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { getFavorites, setFavorites } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session-context";
import { favoritesNeedUpload, mergeFavoriteSymbols } from "@/lib/favorites/merge";

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

/** Local siempre; con sesión también guarda en la cuenta (sin bloquear). */
export function useFavorites() {
  const symbols = useSyncExternalStore(subscribe, read, favoritesOnServer);
  const session = useSession();
  const toggle = useCallback(
    (symbol: string) => {
      const current = read();
      const next = current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol];
      try {
        write(next);
      } catch {
        return;
      }
      if (session.status === "authenticated") {
        setFavorites(next).catch(() => {});
      }
    },
    [session.status],
  );
  return { symbols, toggle };
}

/**
 * Al entrar con sesión: une lo del servidor con lo local y sube lo nuevo.
 * Sin red o sin tabla (migración no aplicada) queda lo local, sin romper.
 */
export function useSyncFavorites() {
  const session = useSession();
  useEffect(() => {
    if (session.status !== "authenticated") return;
    let cancelled = false;
    void (async () => {
      try {
        const server = await getFavorites();
        if (cancelled) return;
        const merged = mergeFavoriteSymbols(server, read());
        try {
          write(merged);
        } catch {
          return;
        }
        if (favoritesNeedUpload(server, merged)) await setFavorites(merged);
      } catch {
        // Sin red o sin 0006: queda lo local.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.status]);
}

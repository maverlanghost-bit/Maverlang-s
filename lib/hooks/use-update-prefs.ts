"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import { setPrefs } from "@/lib/api/client";
import type { Preferences } from "@/lib/types";

function samePrefs(a: Preferences, b: Preferences): boolean {
  return (
    a.notifyOrders === b.notifyOrders &&
    a.notifyDeposits === b.notifyDeposits &&
    a.notifyNews === b.notifyNews &&
    a.language === b.language &&
    a.displayCurrency === b.displayCurrency
  );
}

/**
 * Escribe en la caché al instante y manda el último valor a `setPrefs`.
 * Los clics seguidos se encolan: el servidor recibe el estado final, en orden.
 */
export function useUpdatePrefs() {
  const queryClient = useQueryClient();
  const desired = useRef<Preferences | null>(null);
  const writing = useRef(false);
  const onErrorRef = useRef<(() => void) | null>(null);

  async function flush() {
    if (writing.current) return;
    writing.current = true;
    try {
      while (desired.current) {
        const next = desired.current;
        desired.current = null;
        try {
          const saved = await setPrefs(next);
          if (desired.current) continue;
          queryClient.setQueryData(["prefs"], saved);
          void queryClient.invalidateQueries({ queryKey: ["me"] });
        } catch {
          if (desired.current) continue;
          onErrorRef.current?.();
          void queryClient.invalidateQueries({ queryKey: ["prefs"] });
        }
      }
    } finally {
      writing.current = false;
      if (desired.current) void flush();
    }
  }

  return function update(patch: Partial<Preferences>, onError?: () => void) {
    const base = queryClient.getQueryData<Preferences>(["prefs"]);
    if (!base) return;
    const next = { ...base, ...patch };
    if (samePrefs(next, base)) return;
    if (onError) onErrorRef.current = onError;
    desired.current = next;
    // Sin revert: un fetch en curso no debe pisar el valor que acabamos de mostrar.
    void queryClient.cancelQueries({ queryKey: ["prefs"], exact: true }, { revert: false });
    queryClient.setQueryData(["prefs"], next);
    void flush();
  };
}

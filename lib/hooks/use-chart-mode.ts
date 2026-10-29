"use client";

import { useCallback, useSyncExternalStore } from "react";

import { useMounted } from "@/lib/hooks/use-mounted";

/** Preferencia del gráfico en la ficha. Simple es el valor de fábrica. */
export const CHART_MODE_KEY = "mv:chart-mode";

const EVENT = "mv-chart-mode";

export type ChartMode = "simple" | "technical";

let memory: ChartMode = "simple";
let memoryReady = false;

export function parseChartMode(raw: string | null | undefined): ChartMode {
  return raw === "technical" ? "technical" : "simple";
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(CHART_MODE_KEY);
  } catch {
    return null;
  }
}

function readMode(): ChartMode {
  if (memoryReady) return memory;
  memory = parseChartMode(readStored());
  memoryReady = true;
  return memory;
}

function serverMode(): ChartMode {
  return "simple";
}

function subscribe(onChange: () => void) {
  const refresh = () => {
    memoryReady = false;
    onChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== CHART_MODE_KEY) return;
    refresh();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, refresh);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, refresh);
  };
}

/**
 * El servidor y el primer render del cliente quedan en Simple.
 * Lo guardado se aplica después de montar, sin mismatch de hidratación.
 */
export function useChartMode(): { mode: ChartMode; setMode: (mode: ChartMode) => void } {
  const stored = useSyncExternalStore(subscribe, readMode, serverMode);
  const mounted = useMounted();
  const setMode = useCallback((next: ChartMode) => {
    const value = parseChartMode(next);
    try {
      window.localStorage.setItem(CHART_MODE_KEY, value);
    } catch {
      // Si el almacenamiento está bloqueado, el modo vive sólo en esta vista.
    }
    memory = value;
    memoryReady = true;
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { mode: mounted ? stored : "simple", setMode };
}

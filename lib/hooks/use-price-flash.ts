"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Destello breve cuando el precio cambia (M41).
 * `priceFlashDirection` es pura (para tests); `usePriceFlash` compara con el
 * valor previo: no destella en el primer render ni al cambiar de moneda.
 * El flash dura ~700 ms. Con `prefers-reduced-motion` el CSS global acorta la
 * transición a 1 ms: queda sólo un cambio de color breve.
 */

export type PriceFlash = "up" | "down" | null;

export const PRICE_FLASH_MS = 700;

export function priceFlashDirection(
  prev: number | null | undefined,
  next: number | null | undefined,
  prevCurrency: string | null | undefined,
  nextCurrency: string | null | undefined,
): PriceFlash {
  if (prev === null || prev === undefined) return null;
  if (next === null || next === undefined) return null;
  if (!Number.isFinite(prev) || !Number.isFinite(next)) return null;
  if (prevCurrency !== nextCurrency) return null;
  if (next > prev) return "up";
  if (next < prev) return "down";
  return null;
}

export function usePriceFlash(value: number | null | undefined, currency?: string | null): PriceFlash {
  const key = currency ?? null;
  const prevRef = useRef<{ value: number; currency: string | null } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flash, setFlash] = useState<PriceFlash>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    const prev = prevRef.current;
    const current = { value, currency: key };
    if (!prev) {
      prevRef.current = current;
      return;
    }
    const direction = priceFlashDirection(prev.value, current.value, prev.currency, current.currency);
    prevRef.current = current;
    if (!direction) {
      setFlash(null);
      return;
    }
    setFlash(direction);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setFlash(null);
    }, PRICE_FLASH_MS);
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value, key]);

  return flash;
}

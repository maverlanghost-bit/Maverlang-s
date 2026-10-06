"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";
import { elapsedSeconds, formatFreshness, freshnessDelayed, parseUpdatedAt } from "@/lib/market/freshness";

/**
 * Indicador discreto de frescura del precio (M41).
 * Recibe la fecha (`dataUpdatedAt` de react-query o el `updatedAt` más
 * reciente de las quotes) y se re-renderiza cada 1 s con un solo intervalo,
 * limpiado al desmontar. `aria-live="off"`: no se anuncia cada segundo.
 */
export function PriceFreshness({
  at,
  stale = false,
  className,
}: {
  at: string | number | Date | null | undefined;
  stale?: boolean;
  className?: string;
}) {
  const { t, language } = useT();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const atMs = parseUpdatedAt(at);
  if (atMs === null) return null;
  const elapsed = elapsedSeconds(now, atMs);
  const delayed = freshnessDelayed(elapsed, stale);

  return (
    <p aria-live="off" className={cn("text-xs", delayed ? "text-warn" : "text-fg-muted", className)}>
      {formatFreshness(elapsed, language)}
      {delayed ? <span>{` · ${t.prices.delayed}`}</span> : null}
    </p>
  );
}

"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useT } from "@/lib/hooks/use-t";
import {
  elapsedSeconds,
  freshnessDelayed,
  parseUpdatedAt,
  resolveFreshnessText,
} from "@/lib/market/freshness";

/**
 * Indicador discreto de frescura del precio (M41).
 * Recibe la fecha (`dataUpdatedAt` de react-query o el `updatedAt` más
 * reciente de las quotes) y se re-renderiza cada 1 s con un solo intervalo,
 * limpiado al desmontar. `aria-live="off"`: no se anuncia cada segundo.
 *
 * Hidratación (M42b): el relativo ("Actualizado hace Xs") depende de la hora
 * actual, que difiere entre el HTML del servidor (ISR) y el navegador. En el
 * primer render (servidor y cliente) se muestra un marcador estable con la
 * misma altura y el reloj parte sólo tras montar, en `useEffect`.
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
  const mounted = useMounted();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const atMs = parseUpdatedAt(at);
  if (atMs === null) return null;
  if (!mounted) {
    return (
      <p aria-live="off" className={cn("text-xs text-fg-muted", className)}>
        {resolveFreshnessText(false, 0, language)}
      </p>
    );
  }
  // Montado pero sin tick aún (hasta 1 s): se mantiene el marcador para no
  // llamar a la hora en el render. El intervalo lo actualiza cada segundo.
  if (!mounted || now === null) {
    return (
      <p aria-live="off" className={cn("text-xs text-fg-muted", className)}>
        {resolveFreshnessText(false, 0, language)}
      </p>
    );
  }
  const elapsed = elapsedSeconds(now, atMs);
  const delayed = freshnessDelayed(elapsed, stale);

  return (
    <p aria-live="off" className={cn("text-xs", delayed ? "text-warn" : "text-fg-muted", className)}>
      {resolveFreshnessText(true, elapsed, language)}
      {delayed ? <span>{` · ${t.prices.delayed}`}</span> : null}
    </p>
  );
}

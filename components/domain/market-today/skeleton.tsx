"use client";

import { moverCardClass } from "@/components/domain/market-today/mover-card";
import { cn } from "@/lib/cn";

/** Barras del esqueleto: mismo gris y mismo radio que el resto de las listas. */
const bar = "rounded-sm bg-surface-2";

/**
 * Esqueleto con la retícula ya cargada: destacada arriba (identidad, precio,
 * rangos, gráfico, acciones) y ranking abajo, todo separado por hairlines y
 * sin bloques apilados. Estático, como el esqueleto de la tabla del mercado.
 */
export function TodaySkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col divide-y divide-border">
      <span className="sr-only">{label}</span>

      <div aria-hidden className="flex flex-col gap-4 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="size-9 shrink-0 rounded-full bg-surface-2" />
            <div className="flex min-w-0 flex-col gap-2">
              <div className={cn(bar, "h-3.5 w-40 max-w-full")} />
              <div className={cn(bar, "h-3 w-28 max-w-full")} />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className={cn(bar, "h-6 w-24")} />
            <div className={cn(bar, "h-3 w-16")} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {["a", "b", "c", "d", "e"].map((key) => (
              <div key={key} className={cn(bar, "h-3 w-4")} />
            ))}
          </div>
          <div className={cn(bar, "h-3 w-10")} />
        </div>

        <div className="h-32 w-full bg-surface-1 sm:h-40" />

        <div className="flex items-center gap-4">
          <div className="h-11 w-28 rounded-full bg-surface-2" />
          <div className={cn(bar, "h-3 w-16")} />
        </div>
      </div>

      <div aria-hidden className="flex flex-col gap-2 py-5">
        <div className="flex items-center gap-6">
          <div className={cn(bar, "h-3 w-16")} />
          <div className={cn(bar, "h-3 w-20")} />
          <div className={cn(bar, "h-3 w-16")} />
        </div>

        <div className="flex flex-col divide-y divide-border">
          {["a", "b", "c", "d", "e"].map((key) => (
            <div key={key} className={cn(moverCardClass, "pointer-events-none")}>
              <div className={cn(bar, "h-3 w-4 shrink-0")} />
              <div className="size-7 shrink-0 rounded-full bg-surface-2" />
              <div className={cn(bar, "h-3 w-24 shrink-0 sm:w-36")} />
              <div className={cn(bar, "ml-auto h-3 w-12 shrink-0")} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

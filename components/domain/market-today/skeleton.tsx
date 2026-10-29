"use client";

import { moverCardClass } from "@/components/domain/market-today/mover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

/** Misma caja que el bloque ya cargado: chip, tres listas y cinco tarjetas. */
export function TodaySkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-3">
      <span className="sr-only">{label}</span>
      <div className="flex min-w-0 flex-col gap-3" aria-hidden>
        <Skeleton className="h-11 w-64 max-w-full rounded-full motion-reduce:animate-none" />
        <div className="flex gap-2 overflow-hidden">
          <Skeleton className="h-11 w-24 rounded-full motion-reduce:animate-none" />
          <Skeleton className="h-11 w-24 rounded-full motion-reduce:animate-none" />
          <Skeleton className="h-11 w-24 rounded-full motion-reduce:animate-none" />
        </div>
        <div className="-mx-4 flex gap-3 overflow-hidden px-4 sm:mx-0 sm:px-0">
          {["a", "b", "c", "d", "e"].map((key) => (
            <Skeleton key={key} className={cn(moverCardClass, "pointer-events-none bg-surface-3 motion-reduce:animate-none")} />
          ))}
        </div>
      </div>
    </div>
  );
}

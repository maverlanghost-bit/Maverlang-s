"use client";

import { moverCardClass } from "@/components/domain/market-today/mover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

/** Misma caja Bento de 2 columnas que el bloque ya cargado: tarjeta destacada + ranking. */
export function TodaySkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <span className="sr-only">{label}</span>
      <div
        aria-hidden
        className="flex flex-col justify-between gap-4 rounded-3xl border border-border/80 bg-white p-4 shadow-xs sm:p-5 lg:col-span-8"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full motion-reduce:animate-none" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-36 rounded-md motion-reduce:animate-none" />
              <Skeleton className="h-3 w-28 rounded-md motion-reduce:animate-none" />
            </div>
          </div>
          <Skeleton className="h-7 w-40 rounded-full motion-reduce:animate-none" />
        </div>
        <Skeleton className="h-8 w-28 rounded-md motion-reduce:animate-none" />
        <Skeleton className="h-[136px] w-full rounded-2xl motion-reduce:animate-none sm:h-[148px]" />
        <div className="flex items-center justify-between border-t border-border/60 pt-3">
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-full motion-reduce:animate-none" />
            <Skeleton className="h-9 w-16 rounded-full motion-reduce:animate-none" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="size-8 rounded-full motion-reduce:animate-none" />
            <Skeleton className="size-8 rounded-full motion-reduce:animate-none" />
          </div>
        </div>
      </div>

      <div
        aria-hidden
        className="flex flex-col justify-between gap-3 rounded-3xl border border-border/80 bg-white p-4 shadow-xs sm:p-5 lg:col-span-4"
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32 rounded-md motion-reduce:animate-none" />
          <Skeleton className="h-4 w-16 rounded-md motion-reduce:animate-none" />
        </div>
        <Skeleton className="h-9 w-full rounded-full motion-reduce:animate-none" />
        <div className="flex flex-col gap-1.5">
          {["a", "b", "c", "d", "e"].map((key) => (
            <Skeleton
              key={key}
              className={cn(moverCardClass, "h-11 pointer-events-none bg-surface-3 motion-reduce:animate-none")}
            />
          ))}
        </div>
        <Skeleton className="h-9 w-full rounded-full motion-reduce:animate-none" />
      </div>
    </div>
  );
}

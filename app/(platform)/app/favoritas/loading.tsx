import { Skeleton } from "@/components/ui/skeleton";

const ROWS = ["a", "b", "c", "d"] as const;

/**
 * Esqueleto de favoritas con la retícula real: título con conteo, chips de
 * orden y la tarjeta con la lista de acciones seguidas. Sin cifras.
 */
export default function FavoritasLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-5 sm:gap-6">
      <span className="sr-only">Cargando las favoritas</span>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-36 max-w-full sm:h-9" />
        <Skeleton className="h-4 w-44 max-w-full" />
      </div>

      <div className="flex gap-2">
        <Skeleton className="h-11 w-28 rounded-full sm:h-9" />
        <Skeleton className="h-11 w-28 rounded-full sm:h-9" />
        <Skeleton className="h-11 w-16 rounded-full sm:h-9" />
      </div>

      <div className="flex min-w-0 flex-col divide-y divide-border overflow-hidden rounded-3xl border border-border bg-bg">
        {ROWS.map((key) => (
          <div key={key} className="flex min-h-[72px] items-center gap-3 py-3 pr-4 pl-4 sm:gap-4 sm:pl-5">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-32 max-w-[70%]" />
            </div>
            <Skeleton className="h-7 w-14 shrink-0" />
            <div className="flex min-w-[76px] shrink-0 flex-col items-end gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

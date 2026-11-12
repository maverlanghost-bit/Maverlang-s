import { Skeleton } from "@/components/ui/skeleton";

const ROWS = ["a", "b", "c", "d"] as const;

/**
 * Esqueleto de la cartera: encabezado, hero patrimonial, gráfico y filas de
 * posiciones. Repite la retícula de la vista para que el cambio no salte.
 */
export default function CarteraLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-10 sm:gap-12">
      <span className="sr-only">Cargando la cartera</span>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>

        <div className="flex flex-col">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-11 w-64 max-w-full sm:h-14" />
          <div className="mt-8 flex flex-wrap gap-x-10 gap-y-5 border-t border-border pt-5">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-28" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-4 border-t border-border pt-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-6 w-40 max-w-full" />
            </div>
            <Skeleton className="h-11 w-full rounded-full sm:w-48" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-48 max-w-full" />
        <Skeleton className="h-11 w-full rounded-full sm:w-64" />
        <Skeleton className="h-60 w-full sm:h-72 lg:h-[360px]" />
      </div>

      <div className="border-t border-border pt-8">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="mt-6 hidden items-center gap-6 border-b border-border pb-2 md:flex">
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="mt-2 flex flex-col divide-y divide-border border-t border-border">
          {ROWS.map((key) => (
            <div key={key} className="flex min-h-14 items-center gap-3 py-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-32 max-w-full" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

const ROWS = ["a", "b", "c", "d"] as const;

/**
 * Esqueleto de la cartera: encabezado, resumen patrimonial, gráfico y filas de
 * posiciones. Repite la retícula de la vista para que el cambio no salte.
 */
export default function CarteraLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-8 sm:gap-10">
      <span className="sr-only">Cargando la cartera</span>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <div className="flex flex-col">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-11 w-64 max-w-full sm:h-14" />
        <Skeleton className="mt-3 h-3 w-36" />
        <div className="mt-7 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-border pt-5 sm:grid-cols-4">
          {ROWS.map((key) => (
            <div key={key} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-24 max-w-full" />
            </div>
          ))}
        </div>
      </div>

      <Skeleton className="h-11 w-full rounded-full sm:w-48" />

      <div className="rounded-3xl bg-surface-1 p-4 shadow-card sm:p-6 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-40" />
          </div>
          <Skeleton className="h-11 w-full rounded-full sm:w-56" />
        </div>
        <Skeleton className="mt-5 h-56 w-full rounded-2xl lg:h-72" />
      </div>

      <div className="rounded-3xl bg-surface-1 p-4 shadow-card sm:p-6 md:p-8">
        <Skeleton className="h-5 w-32" />
        <div className="mt-4 hidden items-center gap-3 sm:flex">
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="mt-2 flex flex-col divide-y divide-border/70">
          {ROWS.map((key) => (
            <div key={key} className="flex items-center gap-3 py-3.5">
              <Skeleton className="size-9 rounded-full" />
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

import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de la cartera: encabezado, tarjetas de resumen y gráfico. */
export default function CarteraLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-8">
      <span className="sr-only">Cargando la cartera</span>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {["a", "b", "c", "d"].map((key) => (
          <div key={key} className="flex min-h-28 flex-col justify-between gap-2 rounded-2xl border border-border/70 bg-surface-1 p-3 sm:min-h-36 sm:p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24 max-w-full" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-11 w-full max-w-lg rounded-full" />
        <Skeleton className="h-56 w-full rounded-2xl lg:h-72" />
      </div>

      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto de Ganar: encabezado, panel de avisos, grilla de LST y la ficha
 * de dólares. Repite la forma de la pantalla real para que no salte al llegar
 * el APY ni los precios.
 */
export default function GanarLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-8">
      <span className="sr-only">Cargando Ganar</span>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <Skeleton className="h-56 w-full rounded-3xl" />

      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {["a", "b", "c", "d", "e", "f"].map((key) => (
          <div key={key} className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-surface-1 p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-20 w-full rounded-2xl" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-11 flex-1 rounded-full" />
              <Skeleton className="h-11 flex-1 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <Skeleton className="h-64 w-full rounded-3xl" />
    </div>
  );
}

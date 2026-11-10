import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto del mercado mientras el servidor resuelve el catálogo y los precios.
 * Repite la forma de la pantalla real (hoy, encabezado, buscador, filtros y filas)
 * para que el contenido no salte al llegar.
 */
export default function MercadoLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-6">
      <span className="sr-only">Cargando el mercado</span>

      <Skeleton className="h-28 w-full rounded-3xl" />

      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <Skeleton className="h-11 w-full rounded-full" />

      <div className="flex flex-wrap gap-2">
        {["a", "b", "c", "d", "e", "f"].map((key) => (
          <Skeleton key={key} className="h-9 w-24 rounded-full" />
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        {["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
          <div key={key} className="flex min-h-16 items-center gap-3 rounded-2xl px-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-40 max-w-full" />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto del hub: encabezado, familias, buscador y filas hairline con la
 * misma retícula que el catálogo (cartera · familia · dato · atraso · cobertura).
 */
export default function CopiarLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-10">
      <span className="sr-only">Cargando las carteras para copiar</span>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Skeleton className="h-9 w-64 max-w-full" />
            <Skeleton className="h-4 w-full max-w-2xl" />
            <Skeleton className="h-4 w-2/3 max-w-md" />
          </div>
          <div className="flex shrink-0 items-center gap-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-11 w-28 rounded-full" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex min-h-11 flex-wrap items-center gap-x-6 gap-y-2 border-b border-border">
          {["a", "b", "c", "d", "e", "f"].map((key) => (
            <Skeleton key={key} className="h-3.5 w-16" />
          ))}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Skeleton className="h-11 w-full rounded-full lg:max-w-md" />
          <div className="flex items-center gap-5">
            <Skeleton className="h-3.5 w-12" />
            {["a", "b", "c"].map((key) => (
              <Skeleton key={key} className="h-3.5 w-16" />
            ))}
          </div>
        </div>

        <div className="flex flex-col">
          <div className="hidden items-end gap-x-4 pb-2 md:grid md:grid-cols-[minmax(0,1fr)_6rem_6rem_6.5rem_4.5rem] lg:gap-x-6">
            {["a", "b", "c", "d", "e"].map((key) => (
              <Skeleton key={key} className="h-3 w-16" />
            ))}
          </div>

          <div className="border-t border-border md:border-t-0">
            {["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
              <div
                key={key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 border-b border-border px-3 py-4 md:grid-cols-[minmax(0,1fr)_6rem_6rem_6.5rem_4.5rem] md:items-center md:gap-x-4 md:py-3.5 lg:gap-x-6"
              >
                <div className="flex min-w-0 flex-col gap-2">
                  <Skeleton className="h-4 w-2/3 max-w-56" />
                  <Skeleton className="h-3 w-1/2 max-w-44" />
                </div>
                <Skeleton className="hidden h-4 w-14 md:block" />
                <Skeleton className="hidden h-4 w-20 md:block" />
                <Skeleton className="hidden h-4 w-16 md:block" />
                <Skeleton className="ml-auto h-4 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

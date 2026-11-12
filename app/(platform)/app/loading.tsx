import { Skeleton } from "@/components/ui/skeleton";

const LIST_ROWS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const SECTION_CHIPS = ["a", "b", "c"] as const;
const RANK_ROWS = ["a", "b", "c", "d"] as const;

/**
 * Esqueleto del mercado mientras el servidor resuelve el catálogo y los precios.
 * Copia la retícula real: encabezado, secciones, «Hoy en el mercado» (titular
 * con gráfico y ranking) y la tabla de acciones. Sin cifras ni datos.
 */
export default function MercadoLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-w-0 flex-col gap-8 lg:gap-10"
    >
      <span className="sr-only">Cargando el mercado</span>

      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-52 max-w-full sm:h-10 sm:w-60" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="flex flex-wrap gap-2">
          {SECTION_CHIPS.map((key) => (
            <Skeleton key={key} className="h-11 w-24 rounded-full" />
          ))}
        </div>
      </div>

      <section className="flex min-w-0 flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-6 w-44 max-w-full" />
          <Skeleton className="h-4 w-24" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="flex flex-col gap-4 rounded-3xl border border-border bg-surface-1 p-4 sm:p-5 lg:col-span-8">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-col gap-2">
                  <Skeleton className="h-4 w-36 max-w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-8 w-28 shrink-0 rounded-full" />
            </div>
            <Skeleton className="h-8 w-40 max-w-full" />
            <Skeleton className="h-28 w-full rounded-2xl sm:h-36" />
            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
              <Skeleton className="h-9 w-36 rounded-full" />
              <Skeleton className="size-8 shrink-0 rounded-full" />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-3xl border border-border bg-surface-1 p-4 sm:p-5 lg:col-span-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-14" />
            </div>
            <Skeleton className="h-9 w-full rounded-full" />
            <div className="flex flex-col gap-1.5">
              {RANK_ROWS.map((key) => (
                <div key={key} className="flex min-h-12 items-center gap-3">
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <Skeleton className="h-3.5 w-20 max-w-[45%]" />
                  <Skeleton className="ml-auto h-3.5 w-16 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-5 w-40 max-w-full" />
        </div>

        <div className="border-t border-border pt-4">
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-14" />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>

        <div className="flex flex-col divide-y divide-border border-t border-border">
          {LIST_ROWS.map((key) => (
            <div key={key} className="flex min-h-16 items-center gap-3 py-2">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-24 max-w-[45%]" />
                <Skeleton className="h-3 w-40 max-w-[70%]" />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

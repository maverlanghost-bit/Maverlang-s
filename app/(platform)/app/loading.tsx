import { Skeleton } from "@/components/ui/skeleton";

const LIST_ROWS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const SECTION_CHIPS = ["a", "b", "c"] as const;
const RANK_ROWS = ["a", "b", "c", "d", "e"] as const;
const VIEW_CHIPS = ["a", "b"] as const;
const SORT_CHIPS = ["a", "b", "c"] as const;
const FILTER_CHIPS = ["a", "b", "c", "d", "e"] as const;

/** Chips de criterio: 44 px táctiles en móvil y 32 px con puntero, como el texto real. */
function ChipBar({ width }: { width: string }) {
  return (
    <span className="flex min-h-11 items-center sm:min-h-8">
      <Skeleton className={`h-3.5 ${width}`} />
    </span>
  );
}

/**
 * Esqueleto del mercado mientras el servidor resuelve el catálogo y los precios.
 * Copia la retícula real: encabezado, secciones, «Hoy en el mercado» (destacada
 * con gráfico y ranking sobre hairlines) y la lista de acciones. Sin cifras, sin
 * datos y sin cajas que después no existan.
 */
export default function MercadoLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-w-0 flex-col gap-8 lg:gap-10"
    >
      <span className="sr-only">Cargando la pantalla</span>

      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-52 max-w-full sm:h-10 sm:w-60" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-0.5">
          {SECTION_CHIPS.map((key) => (
            <ChipBar key={key} width="w-16" />
          ))}
        </div>
      </div>

      {/* Hoy en el mercado: sección plana con hairlines, igual que en pantalla. */}
      <section className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-border pb-3">
          <Skeleton className="h-4 w-36 max-w-full" />
          <Skeleton className="h-4 w-44 max-w-full" />
        </div>

        <div className="flex min-w-0 flex-col divide-y divide-border">
          <div className="flex flex-col gap-4 py-5">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div className="flex min-w-0 items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-col gap-2">
                  <Skeleton className="h-4 w-32 max-w-full" />
                  <Skeleton className="h-3 w-40 max-w-full" />
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Skeleton className="h-7 w-28 max-w-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
              <div className="flex items-center gap-4">
                {SORT_CHIPS.map((key) => (
                  <Skeleton key={key} className="h-3 w-6" />
                ))}
              </div>
              <Skeleton className="h-3 w-16" />
            </div>

            <Skeleton className="h-32 w-full sm:h-40" />

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Skeleton className="h-9 w-32 rounded-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2 py-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              {SORT_CHIPS.map((key) => (
                <Skeleton key={key} className="h-3 w-14" />
              ))}
            </div>
            <div className="flex flex-col divide-y divide-border">
              {RANK_ROWS.map((key) => (
                <div key={key} className="flex min-h-12 items-center gap-3 py-2">
                  <Skeleton className="h-3 w-4 shrink-0" />
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <Skeleton className="h-3.5 w-24 max-w-[45%]" />
                  <Skeleton className="ml-auto h-3.5 w-12 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <Skeleton className="h-6 w-28 max-w-full" />
          <div className="flex items-center gap-x-6">
            {VIEW_CHIPS.map((key) => (
              <ChipBar key={key} width="w-12" />
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4">
            <Skeleton className="h-4 w-16 shrink-0" />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-0.5">
              {SORT_CHIPS.map((key) => (
                <ChipBar key={key} width="w-14" />
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-4">
            <Skeleton className="h-4 w-20 shrink-0" />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-0.5">
              {FILTER_CHIPS.map((key) => (
                <ChipBar key={key} width="w-16" />
              ))}
            </div>
          </div>
        </div>

        {/* Encabezado de columnas: sólo con puntero, como en la lista real. */}
        <div
          aria-hidden
          className="hidden items-center justify-end border-b border-border pb-2 pr-[3.75rem] sm:flex md:pr-16"
        >
          <Skeleton className="h-3 w-24" />
        </div>

        <div className="flex flex-col divide-y divide-border">
          {LIST_ROWS.map((key) => (
            <div key={key} className="flex min-h-16 items-center gap-3 px-2 py-2 sm:px-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-24 max-w-[45%]" />
                <Skeleton className="h-3 w-40 max-w-[70%]" />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-10" />
              </div>
              <Skeleton className="size-11 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

const ROWS = ["a", "b", "c", "d"] as const;
const SECTION_CHIPS = ["a", "b", "c"] as const;

/**
 * Esqueleto de favoritas con la retícula real: secciones del mercado,
 * encabezado con frescura, orden y la lista de acciones seguidas. Sin precios
 * ni cifras hasta que lleguen, y sin cápsulas donde la pantalla usa texto.
 */
export default function FavoritasLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-6">
      <span className="sr-only">Cargando las favoritas</span>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-0.5">
        {SECTION_CHIPS.map((key) => (
          <span key={key} className="flex min-h-11 items-center sm:min-h-8">
            <Skeleton className="h-3.5 w-16" />
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-40 max-w-full sm:h-10 sm:w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="mt-1 h-3.5 w-44 max-w-full" />
      </div>

      <div className="inline-flex w-fit max-w-full rounded-full border border-border bg-surface-2 p-1">
        <Skeleton className="h-11 w-28 rounded-full" />
        <Skeleton className="ml-1 h-11 w-24 rounded-full" />
      </div>

      <div className="flex min-w-0 flex-col divide-y divide-border">
        {ROWS.map((key) => (
          <div key={key} className="flex min-h-16 items-center gap-3 px-2 py-2 sm:px-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-20 max-w-[40%]" />
              <Skeleton className="h-3 w-40 max-w-[70%]" />
            </div>
            <Skeleton className="hidden h-7 w-16 shrink-0 sm:block" />
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="size-11 shrink-0 rounded-full" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-6 w-32 max-w-full" />
          <Skeleton className="size-5 shrink-0 rounded-full" />
        </div>
        <Skeleton className="h-20 w-full rounded-2xl sm:h-16" />
      </div>
    </div>
  );
}

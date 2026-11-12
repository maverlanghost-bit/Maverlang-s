import { Skeleton } from "@/components/ui/skeleton";

const ROWS = ["a", "b", "c", "d"] as const;
const SECTION_CHIPS = ["a", "b", "c"] as const;

/**
 * Esqueleto de favoritas con la retícula real: secciones del mercado,
 * encabezado con frescura, orden y la lista de acciones seguidas. Sin precios
 * ni cifras hasta que lleguen.
 */
export default function FavoritasLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-6">
      <span className="sr-only">Cargando las favoritas</span>

      <div className="flex flex-wrap gap-2">
        {SECTION_CHIPS.map((key) => (
          <Skeleton key={key} className="h-11 w-24 rounded-full" />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-40 max-w-full sm:h-10 sm:w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="mt-1 h-4 w-44 max-w-full" />
      </div>

      <div className="inline-flex w-fit max-w-full rounded-full border border-border/70 bg-surface-2 p-1">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="ml-1 h-9 w-24 rounded-full" />
      </div>

      <ul className="flex min-w-0 flex-col divide-y divide-border/50 rounded-3xl border border-border p-2">
        {ROWS.map((key) => (
          <li key={key} className="flex min-h-16 items-center gap-3 px-1 py-2 sm:px-2">
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
          </li>
        ))}
      </ul>

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

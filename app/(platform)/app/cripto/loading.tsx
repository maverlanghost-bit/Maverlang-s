import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

/** Misma retícula que la tabla real: activo · verificación · tope · precio · chevron. */
const ROW_COLUMNS = "sm:grid-cols-[minmax(0,1fr)_8.25rem_6.5rem_7.5rem_1.25rem]";

const SECTION_CHIPS = ["a", "b", "c"] as const;
const FILTER_PILLS = ["Todas", "Cripto", "Dólar", "Oro"] as const;
const LIST_ROWS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

/**
 * Esqueleto de Cripto alineado con la vista nueva: chips de mercado, sub-tabs
 * Tokens/Ganar, filtros por categoría y tabla institucional con hairlines.
 */
export default function CriptoLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-6">
      <span className="sr-only">Cargando criptos</span>

      <div aria-hidden className="flex items-center gap-x-6">
        {SECTION_CHIPS.map((key) => (
          <span key={key} className="flex min-h-11 items-center sm:min-h-8">
            <Skeleton className="h-3.5 w-16" />
          </span>
        ))}
      </div>

      <div
        aria-hidden
        className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border pb-3"
      >
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-1 p-1">
          <Skeleton className="h-9 w-20 rounded-full" />
          <Skeleton className="h-9 w-20 rounded-full" />
        </div>
        <Skeleton className="h-4 w-48 max-w-full" />
      </div>

      <div aria-hidden className="flex flex-col gap-5">
        <div className="flex items-center gap-2 overflow-hidden">
          {FILTER_PILLS.map((key) => (
            <Skeleton key={key} className="h-11 w-20 shrink-0 rounded-full sm:h-10" />
          ))}
        </div>

        <div className="flex flex-col">
          <div
            className={cn(
              "hidden items-center gap-x-3 border-b border-border px-2 pb-2 sm:grid",
              ROW_COLUMNS,
            )}
          >
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="ml-auto h-3.5 w-16" />
            <Skeleton className="ml-auto h-3.5 w-12" />
            <span />
          </div>

          <ul className="flex flex-col divide-y divide-border border-t border-border sm:border-t-0">
            {LIST_ROWS.map((key) => (
              <li
                key={key}
                className={cn(
                  "flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1.5 px-2 py-3 sm:grid sm:min-h-16 sm:flex-nowrap sm:gap-y-0",
                  ROW_COLUMNS,
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
                  <Skeleton className="size-9 shrink-0 rounded-full" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-12" />
                    <Skeleton className="h-3.5 w-24 max-w-full" />
                  </div>
                </div>
                <Skeleton className="hidden h-4 w-20 sm:block" />
                <Skeleton className="ml-auto hidden h-4 w-16 sm:block" />
                <Skeleton className="ml-auto h-4 w-20 shrink-0 sm:ml-0" />
                <span className="hidden sm:block" />
                <div className="w-full pl-12 sm:hidden">
                  <Skeleton className="h-3 w-40 max-w-full" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div aria-hidden className="flex flex-col gap-2 border-t border-border pt-6">
        <Skeleton className="h-3 w-full max-w-xl" />
        <Skeleton className="h-3 w-4/5 max-w-lg" />
      </div>
    </div>
  );
}

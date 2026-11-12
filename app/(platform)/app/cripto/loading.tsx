import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

/** Misma retícula que la tabla real: activo · sello · tope · precio. */
const ROW_COLUMNS = "sm:grid-cols-[minmax(0,1fr)_5rem_6.5rem_8rem]";

function GroupSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-44 max-w-full" />
        </div>
        <Skeleton className="h-4 w-20" />
      </div>

      <div className="flex flex-col">
        <div
          className={cn("hidden items-center gap-x-3 border-b border-border px-2 pb-2 sm:grid", ROW_COLUMNS)}
        >
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="ml-auto h-4 w-12" />
          <Skeleton className="ml-auto h-4 w-14" />
        </div>

        <ul className="flex flex-col divide-y divide-border border-t border-border sm:border-t-0">
          {["a", "b", "c", "d", "e", "f"].map((key) => (
            <li
              key={key}
              className={cn(
                "flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2.5 sm:grid sm:min-h-16 sm:flex-nowrap sm:gap-y-0 sm:py-3",
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
              <Skeleton className="hidden h-4 w-14 sm:block" />
              <Skeleton className="ml-auto hidden h-4 w-16 sm:block" />
              <Skeleton className="ml-auto h-4 w-20 shrink-0 sm:ml-0" />
              <div className="w-full pl-12 sm:hidden">
                <Skeleton className="h-3 w-40 max-w-full" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Esqueleto de Cripto con la misma retícula que la lista nueva: encabezado,
 * avisos, conteo y frescura, navegación de grupos y tabla con hairlines.
 */
export default function CriptoLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-6">
      <span className="sr-only">Cargando criptos</span>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-4/5 max-w-md" />
      </div>

      <div className="flex flex-col gap-1 border-y border-border py-3" aria-hidden>
        <Skeleton className="h-4 w-56 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <Skeleton className="h-4 w-64 max-w-full" />

      <div aria-hidden className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border pb-3">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-28" />
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <div className="flex min-h-5 items-center">
            <Skeleton className="h-4 w-24" />
          </div>
          {["Cripto", "Dólar", "Oro"].map((key) => (
            <div key={key} className="flex min-h-11 items-center">
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>

        <Skeleton className="h-4 w-80 max-w-full" />

        <div className="flex flex-col gap-10">
          <GroupSkeleton />
          <GroupSkeleton />
          <GroupSkeleton />
        </div>
      </div>

      <div className="border-t border-border pt-4" aria-hidden>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-4/5" />
      </div>
    </div>
  );
}

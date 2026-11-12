import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de la ficha de una acción: cabecera, precio, gráfico, datos y panel de operación. */
export default function AccionLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-x-12"
    >
      <span className="sr-only">Cargando la acción</span>

      <div className="flex min-w-0 flex-col gap-9">
        <div className="flex min-w-0 flex-col gap-5">
          <Skeleton className="h-5 w-36" />
          <div className="flex items-start gap-4">
            <Skeleton className="size-[52px] shrink-0 rounded-full bg-surface-2" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-8 w-44 max-w-full bg-surface-2" />
              <Skeleton className="h-4 w-36 max-w-full" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Skeleton className="-ml-1 h-12 w-56 max-w-full bg-surface-2" />
          <Skeleton className="h-4 w-32" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-11 w-full rounded-full bg-surface-2 sm:w-80" />
            <Skeleton className="h-11 w-44 rounded-full" />
          </div>
          <div className="rounded-2xl p-px shadow-card">
            <Skeleton className="h-64 w-full rounded-2xl sm:h-80" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-11 w-48 rounded-full" />
          <Skeleton className="h-11 w-36 rounded-full" />
        </div>

        <div className="border-t border-border pt-6">
          <Skeleton className="h-5 w-24" />
          <div className="mt-4 grid grid-cols-1 gap-x-10 sm:grid-cols-2">
            {["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
              <div key={key} className="flex items-center justify-between gap-4 border-b border-border/70 py-2.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <Skeleton className="h-5 w-52 max-w-full" />
          <div className="mt-4 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
            {["a", "b", "c", "d"].map((key) => (
              <div key={key} className="border-t border-border/70 pt-2.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="rounded-3xl border border-border bg-bg p-6">
          <Skeleton className="h-6 w-40 bg-surface-2" />
          <Skeleton className="mt-5 h-3 w-28" />
          <Skeleton className="mt-2 h-7 w-36 bg-surface-2" />
          <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <Skeleton className="h-12 w-full rounded-full bg-surface-2" />
            <Skeleton className="h-12 w-full rounded-full" />
          </div>
        </div>
      </aside>
    </div>
  );
}

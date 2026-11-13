import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de la ficha de una acción: cabecera, precio, gráfico, datos y panel de operación. */
export default function AccionLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-x-16"
    >
      <span className="sr-only">Cargando la acción</span>

      <div className="flex min-w-0 flex-col gap-10">
        <div className="flex min-w-0 flex-col gap-4">
          <Skeleton className="h-5 w-36" />
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="size-12 shrink-0 rounded-full bg-surface-2" />
            <div className="flex min-w-0 flex-1 basis-44 flex-col gap-2">
              <Skeleton className="h-8 w-48 max-w-full bg-surface-2" />
              <Skeleton className="h-4 w-36 max-w-full" />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="size-10 rounded-full" />
            </div>
          </div>
        </div>

        {/* Mismo orden que la pantalla: en móvil el precio va antes que el contexto. */}
        <div className="order-1 flex min-w-0 flex-col lg:order-2">
          <Skeleton className="-ml-1 h-14 w-56 max-w-full bg-surface-2" />
          <Skeleton className="mt-3 h-4 w-40" />

          <div className="mt-2 flex items-center justify-between gap-4 border-b border-border pb-2">
            <div className="flex items-center gap-5">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="h-4 w-24" />
          </div>

          <Skeleton className="mt-4 h-64 w-full rounded-xl sm:h-80 md:h-[380px]" />

          <div className="mt-2 flex items-center justify-between gap-4">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-20" />
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <Skeleton className="h-4 w-3/4 max-w-sm" />
            <Skeleton className="mt-3 h-1 w-full rounded-full" />
            <div className="mt-3 flex items-center justify-between gap-4">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          </div>
        </div>

        {/* Contexto del activo: en móvil va después del precio. */}
        <div className="order-2 flex flex-wrap items-center gap-x-3 gap-y-2 lg:order-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-11 w-48 rounded-full" />
          <Skeleton className="h-11 w-36 rounded-full" />
        </div>

        <div className="border-t border-border pt-8">
          <div className="flex items-baseline justify-between gap-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-x-12 sm:grid-cols-2">
            {["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((key) => (
              <div key={key} className="flex items-center justify-between gap-6 border-b border-border/70 py-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-8">
          <Skeleton className="h-6 w-52 max-w-full" />
          <Skeleton className="mt-3 h-4 w-4/5 max-w-sm" />
          <div className="mt-5 grid grid-cols-2 gap-x-8">
            {["a", "b"].map((key) => (
              <div key={key} className="border-t border-border/70 py-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-5 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-6 rounded-3xl border border-border bg-bg p-5 lg:p-6">
          <Skeleton className="h-6 w-40 bg-surface-2" />
          <Skeleton className="mt-2 h-3.5 w-28" />
          <div className="mt-5 border-t border-border pt-5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-2.5 h-7 w-36 bg-surface-2" />
            <Skeleton className="mt-2 h-3 w-40" />
          </div>
          <div className="mt-4 border-t border-border/70 pt-3">
            <div className="flex items-center justify-between gap-4 py-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex items-center justify-between gap-4 py-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-1.5 border-t border-border pt-5">
            <Skeleton className="h-12 w-full rounded-full bg-surface-2" />
            <Skeleton className="h-11 w-full rounded-full" />
          </div>
        </div>
      </aside>
    </div>
  );
}

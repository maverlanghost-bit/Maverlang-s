import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto de la ficha de una cripto con la retícula nueva: volver, cabecera,
 * contexto, boleta de precio a la derecha (primero en móvil) y secciones con
 * hairline: datos del token, historial y avisos.
 */
export default function CriptoLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-6">
      <span className="sr-only">Cargando la cripto</span>

      <div className="flex min-h-11 items-center" aria-hidden>
        <Skeleton className="h-4 w-24" />
      </div>

      <div className="flex flex-col gap-4" aria-hidden>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 basis-44 flex-col gap-2">
            <Skeleton className="h-7 w-44 max-w-full" />
            <Skeleton className="h-4 w-52 max-w-full" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-x-16">
        <aside className="order-1 min-w-0 lg:order-2">
          <div className="flex flex-col gap-4 rounded-xl bg-surface-1 p-6 shadow-card md:p-8" aria-hidden>
            <div className="flex flex-col gap-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="mt-1 h-9 w-44 max-w-full" />
            </div>
            <Skeleton className="h-3 w-56 max-w-full" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Skeleton className="h-12 w-full rounded-full" />
              <Skeleton className="h-12 w-full rounded-full" />
            </div>
            <Skeleton className="h-3 w-40 max-w-full" />
          </div>
        </aside>

        <div className="order-2 flex min-w-0 flex-col gap-10 lg:order-1" aria-hidden>
          <div className="border-t border-border pt-8">
            <Skeleton className="h-5 w-32" />
            <div className="mt-3 flex flex-col">
              {["red", "origen", "sello", "decimales", "tope"].map((key) => (
                <div
                  key={key}
                  className="flex items-baseline justify-between gap-6 border-b border-border/70 py-3"
                >
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
              <div className="py-3">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="mt-2 h-4 w-full max-w-sm" />
                <Skeleton className="mt-1.5 h-4 w-2/3 max-w-xs" />
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                  <Skeleton className="h-11 w-28 rounded-full" />
                  <Skeleton className="h-11 w-32" />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-8">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-3 h-4 w-full max-w-prose" />
            <Skeleton className="mt-2 h-4 w-4/5 max-w-md" />
          </div>

          <div className="border-t border-border pt-8">
            <Skeleton className="h-5 w-20" />
            <div className="mt-3 flex flex-col gap-2">
              <Skeleton className="h-4 w-full max-w-prose" />
              <Skeleton className="h-4 w-11/12 max-w-prose" />
              <Skeleton className="h-4 w-4/5 max-w-md" />
              <Skeleton className="h-4 w-2/3 max-w-sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

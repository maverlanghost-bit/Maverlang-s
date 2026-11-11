import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto de la ficha de una cripto, con el mismo orden y los mismos bloques
 * que la página real: volver, cabecera, sello, panel de precio con los dos
 * botones, historial, datos del token y avisos.
 */
export default function CriptoLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-6">
      <span className="sr-only">Cargando la cripto</span>

      <Skeleton className="h-11 w-32 rounded-full" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 basis-48 flex-col gap-2">
            <Skeleton className="h-7 w-44 max-w-full" />
            <Skeleton className="h-4 w-52 max-w-full" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>

      <div className="flex flex-col gap-4 rounded-3xl bg-surface-1 p-5 shadow-card">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-48 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Skeleton className="h-12 w-full rounded-full" />
          <Skeleton className="h-12 w-full rounded-full" />
        </div>
        <Skeleton className="h-3 w-56 max-w-full" />
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border-strong/70 p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-full" />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-surface-1 p-5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  );
}

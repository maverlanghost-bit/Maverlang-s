import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de la ficha de una acción: encabezado, precio, gráfico y datos. */
export default function AccionLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-6">
      <span className="sr-only">Cargando la acción</span>

      <div className="flex items-center justify-between gap-2">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="size-9 rounded-full" />
      </div>

      <div className="flex items-center gap-3">
        <Skeleton className="size-12 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-44 max-w-full" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-56 max-w-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>

      <Skeleton className="h-64 w-full rounded-2xl lg:h-80" />

      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-12 w-full rounded-full" />
        <Skeleton className="h-12 w-full rounded-full" />
      </div>

      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  );
}

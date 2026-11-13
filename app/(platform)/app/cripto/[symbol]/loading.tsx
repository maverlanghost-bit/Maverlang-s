import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de la ficha de una cripto: encabezado, precio, datos y avisos. */
export default function CriptoLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-6">
      <span className="sr-only">Cargando la cripto</span>

      <Skeleton className="h-9 w-32 rounded-full" />

      <div className="flex items-center gap-3">
        <Skeleton className="size-12 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-52 max-w-full" />
        </div>
      </div>

      <div className="flex gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>

      <div className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-surface-1 p-5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-11 w-48 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Skeleton className="h-12 w-full rounded-full" />
          <Skeleton className="h-12 w-full rounded-full" />
        </div>
      </div>

      <Skeleton className="h-24 w-full rounded-2xl" />

      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-surface-1 p-5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

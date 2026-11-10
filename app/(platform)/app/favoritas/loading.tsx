import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de favoritas: encabezado, orden y la lista de acciones guardadas. */
export default function FavoritasLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando las favoritas</span>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <Skeleton className="h-11 w-full max-w-sm rounded-full" />

      <div className="flex flex-col gap-1.5">
        {["a", "b", "c", "d"].map((key) => (
          <div key={key} className="flex min-h-[6.75rem] items-center gap-3 rounded-2xl border border-border/70 px-3 py-2 sm:min-h-14">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-40 max-w-full" />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

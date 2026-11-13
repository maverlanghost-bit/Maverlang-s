import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto del catálogo: encabezado, familias, buscador y tarjetas. */
export default function CopiarLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando las carteras para copiar</span>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-3 w-40" />
      </div>

      <div className="flex gap-2 overflow-hidden">
        {["a", "b", "c", "d", "e"].map((key) => (
          <Skeleton key={key} className="h-11 w-28 shrink-0 rounded-full" />
        ))}
      </div>

      <Skeleton className="h-11 w-full max-w-md rounded-full" />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {["a", "b", "c", "d", "e", "f"].map((key) => (
          <div
            key={key}
            className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-surface-1 p-5"
          >
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de Cripto: encabezado, chips de grupo y las filas del listado. */
export default function CriptoLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-6">
      <span className="sr-only">Cargando criptos</span>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-24 rounded-full" />
        <Skeleton className="h-11 w-32 rounded-full" />
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-24" />
        <div className="flex flex-col gap-1.5 rounded-3xl border border-border/70 p-2">
          {["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
            <div key={key} className="flex min-h-16 items-center gap-3 px-2">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-40 max-w-full" />
              </div>
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

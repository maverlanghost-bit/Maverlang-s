import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de Cripto: encabezado, avisos, secciones y las filas del listado. */
export default function CriptoLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-5">
      <span className="sr-only">Cargando criptos</span>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <Skeleton className="h-20 w-full rounded-2xl" />

      <Skeleton className="h-5 w-72 max-w-full" />

      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-24" />
        <div className="flex flex-col gap-1.5 rounded-3xl bg-surface-1 p-2 shadow-card">
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

      <div className="border-t border-border pt-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-4/5" />
      </div>
    </div>
  );
}

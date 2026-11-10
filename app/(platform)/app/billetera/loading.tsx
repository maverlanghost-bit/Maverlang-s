import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de la billetera: encabezado, saldo con acciones y movimientos. */
export default function BilleteraLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando la billetera</span>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <Card>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-11 w-48 max-w-full" />
        <Skeleton className="mt-2 h-4 w-56 max-w-full" />
        <div className="mt-6 grid grid-cols-3 gap-2">
          {["a", "b", "c"].map((key) => (
            <Skeleton key={key} className="h-11 w-full rounded-full" />
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-2 border-t border-border/60 pt-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full max-w-xs" />
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
        <Skeleton className="mt-4 h-11 w-full rounded-full" />
        <div className="mt-4 flex flex-col gap-1.5">
          {["a", "b", "c", "d", "e"].map((key) => (
            <div key={key} className="flex min-h-14 items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

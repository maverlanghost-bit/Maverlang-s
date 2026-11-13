import { Skeleton } from "@/components/ui/skeleton";

const CARD = "rounded-xl border border-border bg-surface-1 p-6 md:p-8";
const ASSET_ROWS = ["a", "b", "c", "d"] as const;
const MOVES = ["a", "b", "c", "d", "e"] as const;

/**
 * Esqueleto de la billetera con su retícula real: encabezado, panel de saldo
 * (bóveda, USDC, SOL y acciones), activos y actividad. Sin cifras inventadas.
 */
export default function BilleteraLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando la billetera</span>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-40 max-w-full sm:h-10 sm:w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <div className={CARD}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Skeleton className="size-2 shrink-0 rounded-full" />
            <Skeleton className="h-3.5 w-36 max-w-[55%]" />
            <Skeleton className="h-4 w-16 shrink-0 rounded-full" />
          </div>
          <Skeleton className="h-4 w-28" />
        </div>

        <Skeleton className="h-3 w-24" />
        <div className="mt-2 flex flex-col gap-2">
          <Skeleton className="h-8 w-44 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-32 max-w-full" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:grid sm:grid-cols-3">
          {["a", "b", "c"].map((key) => (
            <Skeleton key={key} className="h-11 w-full rounded-full" />
          ))}
        </div>
      </div>

      <div className={CARD}>
        <Skeleton className="h-6 w-36 max-w-full" />
        <div className="mt-2 flex flex-col divide-y divide-border">
          {ASSET_ROWS.map((key) => (
            <div key={key} className="flex min-h-16 items-center gap-3 py-2">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-20 max-w-[40%]" />
                <Skeleton className="h-3 w-32 max-w-[60%]" />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-14" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={CARD}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-6 w-32 max-w-full" />
          <Skeleton className="h-11 w-56 max-w-full rounded-full sm:h-9" />
        </div>

        <div className="mt-4 flex flex-col gap-2.5 rounded-2xl border border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-6 w-64 max-w-full rounded-full" />
          <Skeleton className="h-11 w-full rounded-xl sm:h-9 sm:w-64" />
        </div>

        <div className="mt-4 flex flex-col gap-6">
          {["a", "b"].map((group) => (
            <div key={group} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <div className="flex flex-col divide-y divide-border">
                {MOVES.map((key) => (
                  <div key={`${group}-${key}`} className="flex min-h-14 items-center gap-3 py-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Skeleton className="h-4 w-40 max-w-[70%]" />
                      <Skeleton className="h-3 w-28 max-w-[50%]" />
                    </div>
                    <Skeleton className="h-4 w-20 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

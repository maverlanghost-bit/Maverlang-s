import { Skeleton } from "@/components/ui/skeleton";

const STAKING_CARDS = ["a", "b", "c", "d", "e", "f"] as const;
const DOLLAR_CARDS = ["a"] as const;

/** Tarjeta de activo con la misma grilla que la real: emisor, datos y acciones. */
function AssetCardSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-3xl border border-border/70 bg-surface-1 p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-32 max-w-[70%]" />
          <Skeleton className="h-3 w-48 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/70 bg-bg p-3">
        {["a", "b"].map((key) => (
          <div key={key} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16 max-w-full" />
            <Skeleton className="h-6 w-20 max-w-full" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <div className="mt-auto flex gap-2">
        <Skeleton className="h-11 flex-1 rounded-full" />
        <Skeleton className="h-11 flex-1 rounded-full" />
      </div>
    </div>
  );
}

/**
 * Esqueleto de Ganar con su retícula real: aviso previo, grilla de LST y
 * ficha de dólares. Sin APY, precios ni cifras hasta que lleguen.
 */
export default function GanarLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-8">
      <span className="sr-only">Cargando Ganar</span>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-36 max-w-full sm:h-10 sm:w-40" />
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-4 w-4/5 max-w-xl" />
      </div>

      <section className="flex flex-col gap-3 rounded-3xl border border-border/70 bg-surface-1 p-5 sm:p-6">
        <Skeleton className="h-5 w-40 max-w-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-full max-w-2xl" />
          <Skeleton className="h-3.5 w-11/12 max-w-2xl" />
          <Skeleton className="h-3.5 w-4/5 max-w-xl" />
        </div>
        <div className="rounded-2xl border border-border/70 bg-bg p-4">
          <Skeleton className="h-3 w-40 max-w-full" />
          <div className="mt-3 flex flex-col gap-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        </div>
        <Skeleton className="h-3 w-64 max-w-full" />
      </section>

      {[STAKING_CARDS, DOLLAR_CARDS].map((group, index) => (
        <section key={index} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-52 max-w-full" />
            <Skeleton className="h-4 w-full max-w-2xl" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {group.map((key) => (
              <AssetCardSkeleton key={key} />
            ))}
          </div>
        </section>
      ))}

      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full max-w-2xl" />
        <Skeleton className="h-3 w-2/3 max-w-lg" />
      </div>
    </div>
  );
}

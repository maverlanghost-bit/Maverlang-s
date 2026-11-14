import { Skeleton } from "@/components/ui/skeleton";

const SECTION_CHIPS = ["a", "b", "c"] as const;
const STAKING_CARDS = ["a", "b", "c", "d", "e", "f"] as const;
const DOLLAR_CARDS = ["a"] as const;

/** Tarjeta de rendimiento con la misma retícula que la real: emisor, métricas y acciones. */
function AssetCardSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface-1 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-32 max-w-[60%]" />
            <Skeleton className="h-4 w-14 rounded-md" />
          </div>
          <Skeleton className="h-3.5 w-40 max-w-full" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 border-y border-border py-3.5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-20 max-w-full" />
          <Skeleton className="h-6 w-20 max-w-full" />
        </div>
        <div className="flex flex-col items-end gap-2">
          <Skeleton className="h-3 w-14 max-w-full" />
          <Skeleton className="h-6 w-20 max-w-full" />
        </div>
      </div>

      <Skeleton className="h-3.5 w-44 max-w-full" />

      <div className="mt-auto flex gap-2 pt-1">
        <Skeleton className="h-11 flex-1 rounded-full sm:h-9" />
        <Skeleton className="h-11 flex-1 rounded-full sm:h-9" />
      </div>
    </div>
  );
}

/**
 * Esqueleto de Ganar alineado con la vista nueva: chips de mercado, sub-tabs
 * Tokens/Ganar, grilla de Staking líquido y tarjeta de Dólares.
 */
export default function GanarLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-6">
      <span className="sr-only">Cargando Ganar</span>

      <div aria-hidden className="flex items-center gap-x-6">
        {SECTION_CHIPS.map((key) => (
          <span key={key} className="flex min-h-11 items-center sm:min-h-8">
            <Skeleton className="h-3.5 w-16" />
          </span>
        ))}
      </div>

      <div
        aria-hidden
        className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border pb-3"
      >
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-1 p-1">
          <Skeleton className="h-9 w-20 rounded-full" />
          <Skeleton className="h-9 w-20 rounded-full" />
        </div>
        <Skeleton className="h-4 w-36 max-w-full" />
      </div>

      {[STAKING_CARDS, DOLLAR_CARDS].map((group, index) => (
        <section key={index} aria-hidden className="flex flex-col gap-4 pt-1">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-36 max-w-full" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {group.map((key) => (
              <AssetCardSkeleton key={key} />
            ))}
          </div>
        </section>
      ))}

      <div aria-hidden className="flex flex-col gap-2 border-t border-border pt-6">
        <Skeleton className="h-3 w-full max-w-2xl" />
        <Skeleton className="h-3 w-11/12 max-w-xl" />
        <Skeleton className="h-3 w-2/3 max-w-lg" />
      </div>
    </div>
  );
}

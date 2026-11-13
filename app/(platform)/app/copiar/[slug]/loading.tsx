import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de la ficha de una cartera: réplica de la retícula nueva. */
export default function CopyPortfolioLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-w-0 max-w-full flex-col gap-8"
    >
      <span className="sr-only">Cargando la cartera</span>

      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-52 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <div className="grid min-w-0 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-2 flex min-w-0 flex-col gap-10 lg:order-1">
          <div className="flex flex-col gap-4 border-t border-border pt-8">
            <div className="flex items-baseline justify-between gap-6">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-40 w-full sm:h-44" />
            <div className="flex flex-col">
              {Array.from({ length: 2 }, (_, index) => (
                <Skeleton key={index} className="mt-2 h-4 w-full" />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-border pt-8">
            <Skeleton className="h-5 w-36" />
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>

          <div className="flex flex-col gap-4 border-t border-border pt-8">
            <Skeleton className="h-5 w-28" />
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </div>

        <div className="order-1 flex min-w-0 flex-col gap-8 lg:order-2">
          <div className="flex flex-col gap-4 rounded-3xl border border-border p-5">
            <Skeleton className="h-5 w-40" />
            <div className="flex items-baseline justify-between gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-4 w-full" />
            <div className="flex items-baseline justify-between gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    </div>
  );
}

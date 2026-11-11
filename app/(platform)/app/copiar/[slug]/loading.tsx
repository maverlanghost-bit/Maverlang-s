import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de la ficha de una cartera: cabecera, gráfico, posiciones y lateral. */
export default function CopyPortfolioLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-w-0 flex-col gap-6">
      <span className="sr-only">Cargando la cartera</span>

      <Skeleton className="h-4 w-32" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Skeleton className="h-56 w-full rounded-2xl" />
          <div className="flex flex-col gap-3 rounded-2xl bg-surface-1 p-5 shadow-card md:p-6">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>

        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-36 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export type LoadingStateVariant = "list" | "cards" | "page";

const LIST_ROWS = ["a", "b", "c", "d", "e"] as const;

/**
 * Cáscara de carga con la forma real del contenido (D1). `cards` es el
 * defecto histórico (título + dos bloques), así que quien no pasa `variant`
 * ve lo mismo que antes. Los bloques usan `motion-safe`, así que con
 * `prefers-reduced-motion` quedan quietos.
 */
export function LoadingState({
  label = "Cargando",
  variant = "cards",
}: {
  label?: string;
  variant?: LoadingStateVariant;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {variant === "list" ? (
        <div className="flex flex-col gap-1.5">
          {LIST_ROWS.map((key) => (
            <Skeleton key={key} className="h-14 w-full rounded-2xl" />
          ))}
        </div>
      ) : variant === "page" ? (
        <>
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </>
      ) : (
        <>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-28 w-full rounded-3xl" />
          <Skeleton className="h-28 w-full rounded-3xl" />
        </>
      )}
    </div>
  );
}

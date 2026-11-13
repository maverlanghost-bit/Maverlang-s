import { Skeleton } from "@/components/ui/skeleton";

export type LoadingStateVariant = "list" | "cards" | "page";

const LIST_ROWS = ["a", "b", "c", "d", "e", "f"] as const;

/** Fila del sistema: logo, dos líneas de texto y el dato a la derecha. */
function Row() {
  return (
    <div className="flex min-h-16 items-center gap-3 py-1">
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3.5 w-28 max-w-[45%]" />
        <Skeleton className="h-3 w-44 max-w-[70%]" />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3 w-10" />
      </div>
    </div>
  );
}

function Rows({ count }: { count: number }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {LIST_ROWS.slice(0, count).map((key) => (
        <Row key={key} />
      ))}
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-9 w-52 max-w-[70%] sm:h-10 sm:w-64" />
      <Skeleton className="h-[1.125rem] w-full max-w-md" />
    </div>
  );
}

/**
 * Carga con la forma real del contenido (D2): encabezado con el ritmo de
 * `PageHeader` (H1 de 36/40px, bajada de 62ch, gap de 8px), hairlines y filas
 * de 64px con logo de 36px y dos líneas de dato —nunca cajas apiladas—.
 * `cards` es el defecto histórico, así que quien no pasa `variant` ve un
 * bloque equivalente. Los bloques usan `motion-safe`, así que con
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
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      {variant === "list" ? (
        <Rows count={6} />
      ) : variant === "page" ? (
        <>
          <Header />
          <div className="flex flex-col gap-6 border-t border-border pt-6">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-11 w-64 max-w-full" />
            </div>
            <Rows count={4} />
          </div>
        </>
      ) : (
        <>
          <Header />
          <section className="flex flex-col gap-4 border-t border-border pt-6">
            <Skeleton className="h-5 w-40" />
            <Rows count={3} />
          </section>
          <section className="flex flex-col gap-4 border-t border-border pt-6">
            <Skeleton className="h-5 w-32" />
            <Rows count={3} />
          </section>
        </>
      )}
    </div>
  );
}

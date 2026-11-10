import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto del asistente: una conversación corta y el cuadro de escritura.
 * En móvil deja el alto del encabezado flotante libre (el layout no aplica
 * padding superior en esta ruta).
 */
export default function AsistenteLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[60vh] flex-col gap-4 pt-[calc(env(safe-area-inset-top)+4.5rem)] lg:pt-0"
    >
      <span className="sr-only">Cargando el asistente</span>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <Skeleton className="ml-auto h-16 w-3/4 max-w-md rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-5/6 rounded-2xl" />
        </div>

        <Skeleton className="mt-auto h-14 w-full rounded-3xl" />
      </div>
    </div>
  );
}

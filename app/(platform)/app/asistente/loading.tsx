import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto del asistente con la retícula real: barra de conversación,
 * mensajes y cuadro de escritura abajo. En móvil deja libre el alto del
 * encabezado flotante (el layout no aplica padding superior en esta ruta).
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

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-5 w-40 max-w-full" />
            <Skeleton className="h-3 w-24 max-w-full" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="size-9 rounded-full" />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-8">
          <div className="ml-auto flex w-full max-w-md flex-col items-end gap-2">
            <Skeleton className="h-12 w-3/4 rounded-2xl" />
            <Skeleton className="h-3 w-16" />
          </div>

          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="mt-3 h-4 w-1/2" />
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-6">
          <Skeleton className="h-14 w-full rounded-3xl" />
          <Skeleton className="h-3 w-48 max-w-full" />
        </div>
      </div>
    </div>
  );
}

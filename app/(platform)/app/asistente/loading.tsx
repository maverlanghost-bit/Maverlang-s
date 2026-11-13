import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto del asistente con el marco real: panel a pantalla completa, la
 * conversación con su mismo inset (deja aire para los controles flotantes de
 * arriba) y el composer fijo al pie, por encima de las pestañas.
 */
export default function AsistenteLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-20 flex min-h-0 flex-col overflow-hidden bg-bg pb-[var(--app-tabs-height)] lg:left-[var(--app-sidebar-width,0px)] lg:pb-0"
    >
      <span className="sr-only">Cargando el asistente</span>

      {/* Controles flotantes: volver a la izquierda y acciones a la derecha. */}
      <div className="absolute top-3 left-3 z-30">
        <Skeleton className="size-11 rounded-full" />
      </div>
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2.5">
        <Skeleton className="size-11 rounded-full" />
        <Skeleton className="size-11 rounded-full" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-16 pb-6">
        <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col gap-6">
          <div className="ml-auto flex w-full max-w-[85%] flex-col items-end gap-2 sm:max-w-md">
            <Skeleton className="h-12 w-4/5 rounded-3xl" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="flex min-w-0 flex-col gap-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="mt-3 h-4 w-1/2" />
          </div>
        </div>
      </div>

      {/* Composer fijo al pie, con el ancho de lectura de la conversación. */}
      <div className="shrink-0 px-3 pt-2 pb-3 sm:px-4 sm:pb-4">
        <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-2">
          <Skeleton className="h-14 w-full rounded-3xl" />
          <Skeleton className="h-3 w-48 max-w-full" />
        </div>
      </div>
    </div>
  );
}

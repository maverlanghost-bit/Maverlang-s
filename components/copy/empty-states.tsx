import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** «Pronto»: la sección todavía no está encendida o no existe ningún feed. */
export function CopySoonState({
  title = "Copiar carteras llegará pronto",
  description = "Estamos afinando los últimos detalles con Fraccion.si. Por ahora esta sección no está disponible.",
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <EmptyState title={title} description={description} />
    </div>
  );
}

/** El feed existe pero no se pudo leer ni recuperar la última copia buena. */
export function CopyFeedUnavailable({
  retryHref = "/app/copiar",
  className,
}: {
  retryHref?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <EmptyState
        title="No pudimos cargar las carteras"
        description="El feed de Fraccion.si no respondió o no pasó la verificación. Vuelve a intentarlo en unos minutos."
        action={
          <Link href={retryHref} className={buttonClasses({ variant: "secondary", size: "md" })}>
            Reintentar
          </Link>
        }
      />
    </div>
  );
}

/** Hay feed, pero la búsqueda o el filtro no dejan ninguna cartera. */
export function CopyNoResults({
  resetHref = "/app/copiar",
  className,
}: {
  resetHref?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <EmptyState
        title="Sin resultados"
        description="No hay carteras que coincidan con la búsqueda o con el filtro elegido."
        action={
          <Link href={resetHref} className={buttonClasses({ variant: "secondary", size: "md" })}>
            Limpiar filtros
          </Link>
        }
      />
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";

import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Aviso de estado sin cápsula: título, una línea de contexto y, si hay, el
 * siguiente paso. Hairline arriba para separarlo del encabezado de la ruta.
 */
function CopyNotice({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col items-start gap-2 border-t border-border pt-8", className)}>
      <h2 className="text-base leading-snug font-medium tracking-tight text-fg">{title}</h2>
      <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">{description}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </section>
  );
}

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
  return <CopyNotice title={title} description={description} className={className} />;
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
    <CopyNotice
      title="No pudimos cargar las carteras"
      description="El feed de Fraccion.si no respondió o no pasó la verificación. Vuelve a intentarlo en unos minutos."
      className={className}
      action={
        <Link
          href={retryHref}
          className={buttonClasses({ variant: "secondary", size: "md", className: "min-h-11" })}
        >
          Reintentar
        </Link>
      }
    />
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
    <CopyNotice
      title="Sin resultados"
      description="No hay carteras que coincidan con la búsqueda o con el filtro elegido."
      className={className}
      action={
        <Link
          href={resetHref}
          className={buttonClasses({ variant: "secondary", size: "md", className: "min-h-11" })}
        >
          Limpiar filtros
        </Link>
      }
    />
  );
}

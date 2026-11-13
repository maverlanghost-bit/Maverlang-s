import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

/**
 * Error como contenido (D2): sin caja ni sombra. Se compone sobre
 * `EmptyState` para compartir anatomía y ritmo exactos (marca, título,
 * descripción de 62ch, acción). La señal roja es un punto junto al rótulo;
 * el reintento es el único botón y la acción principal.
 * `role="alert"` se conserva para que el lector de pantalla lo anuncie.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = "Reintentar",
  label = "Error",
  className,
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  label?: string;
  className?: string;
}) {
  /* Si `label` repite el título (varios consumidores pasan el mismo texto en
     ambos), el rótulo sobra: se muestra sólo cuando aporta. */
  const showLabel = label.length > 0 && label !== title;

  return (
    <div role="alert" className={cn(className)}>
      <EmptyState
        title={title}
        description={description}
        media={
          showLabel ? (
            <p className="inline-flex items-center gap-1.5 font-mono text-[13px] leading-5 font-medium tracking-[0.045em] text-fg-muted uppercase">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-down" />
              {label}
            </p>
          ) : undefined
        }
        action={
          onRetry ? (
            <Button variant="primary" onClick={onRetry} className="min-h-11">
              {retryLabel}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Cáscara única de error (D1). La señal roja es una sola (el badge); el
 * reintento es el botón más fuerte de la vista porque es la única acción.
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
     ambos), el badge sobra: se muestra sólo cuando aporta. */
  const showBadge = label.length > 0 && label !== title;

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-3xl bg-surface-1 px-6 py-10 text-center",
        className,
      )}
    >
      {showBadge ? <Badge tone="down">{label}</Badge> : null}
      <p className="text-base font-medium text-fg">{title}</p>
      {description ? <p className="max-w-sm text-sm leading-relaxed text-fg-muted">{description}</p> : null}
      {onRetry ? (
        <Button variant="primary" onClick={onRetry} className="min-h-11">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

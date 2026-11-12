import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Error como contenido (D2): sin caja ni sombra. La señal roja es un punto
 * junto al rótulo; el reintento es el único botón y la acción principal.
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
    <div role="alert" className={cn("flex flex-col items-center gap-4 py-10 text-center sm:py-12", className)}>
      {showLabel ? (
        <p className="inline-flex items-center gap-1.5 font-mono text-[13px] leading-5 font-medium tracking-[0.045em] text-fg-muted uppercase">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-down" />
          {label}
        </p>
      ) : null}
      <div className="flex max-w-md flex-col gap-2">
        <p className="text-[17px] leading-snug font-medium tracking-tight text-balance text-fg">{title}</p>
        {description ? (
          <p className="text-sm leading-relaxed text-pretty text-fg-muted">{description}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button variant="primary" onClick={onRetry} className="mt-1 min-h-11">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

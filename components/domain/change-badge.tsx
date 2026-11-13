import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { IconArrow } from "@/components/ui/icons";

/**
 * Variación con signo. `size` es opcional y su valor por defecto (`md`) es
 * exactamente el tamaño histórico: quien ya lo usa no cambia de pinta.
 * `sm` sirve para filas densas; `md` acompaña precios de tarjeta.
 */
export function ChangeBadge({
  value,
  className,
  size = "md",
}: {
  value: number;
  className?: string;
  size?: "sm" | "md";
}) {
  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const word = direction === "up" ? "Sube" : direction === "down" ? "Baja" : "Sin cambio";

  return (
    <span
      className={cn(
        // Misma altura y misma caja que `Badge` (20 px): 12 px de texto mínimo.
        "inline-flex items-center gap-1 rounded-full font-mono leading-4 tabular-nums",
        size === "md" ? "px-2 py-0.5 text-xs font-medium" : "px-1.5 py-0.5 text-xs font-medium",
        direction === "up" && "bg-up-bg text-up",
        direction === "down" && "bg-down-bg text-down",
        direction === "flat" && "bg-surface-2 text-fg-muted",
        className,
      )}
    >
      <IconArrow direction={direction} className={size === "sm" ? "size-2.5" : undefined} />
      <span className="sr-only">{word}</span>
      <span>{formatPercent(value)}</span>
    </span>
  );
}

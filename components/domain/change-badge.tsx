import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { IconArrow } from "@/components/ui/icons";

export function ChangeBadge({ value, className }: { value: number; className?: string }) {
  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const word = direction === "up" ? "Sube" : direction === "down" ? "Baja" : "Sin cambio";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-xs tabular-nums",
        direction === "up" && "bg-up-bg text-up",
        direction === "down" && "bg-down-bg text-down",
        direction === "flat" && "bg-surface-2 text-fg-muted",
        className,
      )}
    >
      <IconArrow direction={direction} />
      <span className="sr-only">{word}</span>
      <span>{formatPercent(value)}</span>
    </span>
  );
}

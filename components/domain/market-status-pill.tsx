import { Badge, type BadgeTone } from "@/components/ui/badge";

/** Estado general o por acción. `halted` usa tono de error. El texto lo pone quien llama. */
export function MarketStatusPill({
  open,
  label,
  halted = false,
}: {
  open: boolean;
  label: string;
  halted?: boolean;
}) {
  const tone: BadgeTone = halted ? "down" : open ? "up" : "warn";
  return (
    <Badge tone={tone} className="max-w-full text-left text-sm leading-snug whitespace-normal">
      {label}
    </Badge>
  );
}

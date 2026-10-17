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
    <Badge
      tone={tone}
      className="max-w-full rounded-full px-3 py-1 text-left text-[13px] font-medium leading-snug whitespace-normal"
    >
      {label}
    </Badge>
  );
}

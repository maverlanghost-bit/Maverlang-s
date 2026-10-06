import { Badge } from "@/components/ui/badge";

/** "Mercado abierto" (up). Fuera del horario regular o fin de semana (warn). El texto lo pone quien llama. */
export function MarketStatusPill({ open, label }: { open: boolean; label: string }) {
  return (
    <Badge tone={open ? "up" : "warn"} className="max-w-full text-left text-sm leading-snug whitespace-normal">
      {label}
    </Badge>
  );
}

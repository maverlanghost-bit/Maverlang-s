import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatPortion } from "@/lib/format";

export type PositionStatus = "available" | "review" | "unavailable";

export type PositionRow = {
  symbol: string;
  name?: string | null;
  /** Símbolo operable en Maverlang (`NVDAx` / `NVDAon`); null si no se puede comprar. */
  tradableSymbol?: string | null;
  status: PositionStatus;
  reason?: string | null;
  /** Peso en el portafolio original, 0–100. */
  weightOriginal: number;
  /** Peso en la mezcla de Maverlang, 0–100. */
  weightMaverlang: number;
};

const statusLabel: Record<PositionStatus, string> = {
  available: "Se puede comprar",
  review: "En revisión",
  unavailable: "No disponible en Maverlang",
};

const statusTone: Record<PositionStatus, "up" | "warn" | "neutral"> = {
  available: "up",
  review: "warn",
  unavailable: "neutral",
};

function weight(value: number): string {
  return formatPortion((Number.isFinite(value) ? value : 0) / 100);
}

/**
 * Tabla de posiciones (ficha top 10 y página completa). Sin tabla HTML para
 * que a 360 px no haya scroll horizontal; el estado nunca se comunica sólo
 * con color.
 */
export function PositionsTable({
  rows,
  showMaverlang = true,
  className,
}: {
  rows: readonly PositionRow[];
  /** Sin acceso no se muestra el peso de la mezcla: es composición derivada. */
  showMaverlang?: boolean;
  className?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <div className={cn("flex flex-col", className)}>
      <p className="flex flex-wrap items-center gap-x-3 pb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted">
        <span className="min-w-0 flex-1">Posición</span>
        <span>Original</span>
        {showMaverlang ? <span>En Maverlang</span> : null}
      </p>
      <ul aria-label="Posiciones de la cartera" className="flex flex-col">
        {rows.map((row, index) => (
          <li
            key={`${row.symbol}-${index}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/70 py-2.5"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-mono text-sm text-fg">{row.symbol}</span>
              {row.name ? (
                <span className="truncate text-xs text-fg-muted">{row.name}</span>
              ) : null}
            </div>

            <span className="font-mono text-sm tabular-nums text-fg-body">
              {weight(row.weightOriginal)}
            </span>

            {showMaverlang ? (
              <span
                className={cn(
                  "font-mono text-xs tabular-nums",
                  row.status === "available" ? "text-fg-body" : "text-fg-subtle",
                )}
                title="Peso en la mezcla de Maverlang"
              >
                {row.status === "available" ? weight(row.weightMaverlang) : "—"}
              </span>
            ) : null}

            <Badge tone={statusTone[row.status]} className="shrink-0">
              {row.status === "available" && row.tradableSymbol
                ? `Comprable · ${row.tradableSymbol}`
                : statusLabel[row.status]}
            </Badge>

            {row.status !== "available" && row.reason ? (
              <p className="w-full text-xs leading-relaxed text-fg-muted">{row.reason}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {showMaverlang ? (
        <p className="mt-3 text-xs leading-relaxed text-fg-muted">
          El peso de lo que no se puede comprar se reparte entre las posiciones disponibles.
        </p>
      ) : null}
    </div>
  );
}

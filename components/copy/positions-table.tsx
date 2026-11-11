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
      {/* Cabecera de columnas sólo desde sm: en móvil cada cifra lleva su
          etiqueta inline y nada se corta a 360 px. */}
      <p
        className={cn(
          "hidden items-center gap-x-3 pb-1 text-xs font-medium text-fg-muted sm:grid",
          showMaverlang
            ? "sm:grid-cols-[minmax(0,1fr)_4rem_5rem_auto]"
            : "sm:grid-cols-[minmax(0,1fr)_4rem_auto]",
        )}
      >
        <span>Posición</span>
        <span className="text-right">Original</span>
        {showMaverlang ? <span className="text-right">En Maverlang</span> : null}
        <span className="text-right">Estado</span>
      </p>
      <ul aria-label="Posiciones de la cartera" className="flex flex-col divide-y divide-border/60">
        {rows.map((row, index) => (
          <li key={`${row.symbol}-${index}`} className="py-3">
            <div
              className={cn(
                "grid grid-cols-2 items-baseline gap-x-3 gap-y-2 sm:items-center",
                showMaverlang
                  ? "sm:grid-cols-[minmax(0,1fr)_4rem_5rem_auto]"
                  : "sm:grid-cols-[minmax(0,1fr)_4rem_auto]",
              )}
            >
              <div className="col-span-2 flex min-w-0 flex-col sm:col-span-1">
                <span className="truncate font-mono text-sm text-fg" title={row.symbol}>
                  {row.symbol}
                </span>
                {row.name ? <span className="truncate text-xs text-fg-muted">{row.name}</span> : null}
              </div>

              <span className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
                <span className="text-xs text-fg-muted sm:hidden">Original</span>
                <span className="font-mono text-sm tabular-nums text-fg-body">{weight(row.weightOriginal)}</span>
              </span>

              {showMaverlang ? (
                <span
                  className="flex items-baseline justify-between gap-2 sm:block sm:text-right"
                  title="Peso en la mezcla de Maverlang"
                >
                  <span className="text-xs text-fg-muted sm:hidden">En Maverlang</span>
                  <span
                    className={cn(
                      "font-mono text-sm tabular-nums",
                      row.status === "available" ? "text-fg-body" : "text-fg-muted",
                    )}
                  >
                    {row.status === "available" ? weight(row.weightMaverlang) : "—"}
                  </span>
                </span>
              ) : null}

              <Badge
                tone={statusTone[row.status]}
                className="col-span-2 w-fit justify-self-start sm:col-span-1 sm:justify-self-end"
              >
                {row.status === "available" && row.tradableSymbol
                  ? `Comprable · ${row.tradableSymbol}`
                  : statusLabel[row.status]}
              </Badge>

              {row.status !== "available" && row.reason ? (
                <p className="col-span-2 text-xs leading-relaxed text-fg-muted">{row.reason}</p>
              ) : null}
            </div>
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

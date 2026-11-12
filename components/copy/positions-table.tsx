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
  available: "Comprable",
  review: "En revisión",
  unavailable: "No disponible",
};

const statusTone: Record<PositionStatus, string> = {
  available: "text-fg",
  review: "text-warn",
  unavailable: "text-fg-muted",
};

function weight(value: number): string {
  return formatPortion((Number.isFinite(value) ? value : 0) / 100);
}

/** Retícula de columnas. En móvil cada cifra lleva su rótulo inline. */
function columns(showMaverlang: boolean): string {
  return showMaverlang
    ? "sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_7rem]"
    : "sm:grid-cols-[minmax(0,1fr)_4.5rem_7rem]";
}

/**
 * Tabla de posiciones (ficha y página completa). Sin tabla HTML para que a
 * 360 px no haya scroll horizontal. El estado se dice con palabra y tono,
 * nunca sólo con color y nunca en una cápsula.
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
  if (rows.length === 0) {
    return (
      <p className={cn("border-t border-border/70 py-6 text-[13px] leading-relaxed text-fg-muted", className)}>
        Esta cartera no tiene posiciones publicadas.
      </p>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      {/* Cabecera de columnas sólo desde sm: en móvil nada se corta ni se
          aprieta a 360 px. */}
      <div
        className={cn(
          "hidden items-center gap-x-3 border-b border-border pb-2 font-mono text-[11px] font-medium tracking-[0.045em] text-fg-muted uppercase sm:grid",
          columns(showMaverlang),
        )}
      >
        <span>Posición</span>
        <span className="text-right">Original</span>
        {showMaverlang ? <span className="text-right">Maverlang</span> : null}
        <span className="text-right">Estado</span>
      </div>

      <ul aria-label="Posiciones de la cartera" className="flex flex-col">
        {rows.map((row, index) => (
          <li key={`${row.symbol}-${index}`} className="border-b border-border/70 py-3 last:border-b-0">
            <div
              className={cn(
                "grid grid-cols-2 items-baseline gap-x-3 gap-y-2 sm:items-center",
                columns(showMaverlang),
              )}
            >
              <div className="col-span-2 flex min-w-0 flex-col sm:col-span-1">
                <span className="truncate font-mono text-[15px] leading-5 font-medium text-fg" title={row.symbol}>
                  {row.symbol}
                </span>
                {row.name ? (
                  <span className="truncate text-[13px] leading-5 text-fg-muted">{row.name}</span>
                ) : null}
              </div>

              <div
                className={cn(
                  "flex items-baseline justify-between gap-2 sm:block sm:text-right",
                  !showMaverlang && "col-span-2 sm:col-span-1",
                )}
              >
                <span className="text-[13px] leading-5 text-fg-muted sm:hidden">Original</span>
                <span className="num text-[15px] leading-5 tabular-nums text-fg-body">
                  {weight(row.weightOriginal)}
                </span>
              </div>

              {showMaverlang ? (
                <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
                  <span className="text-[13px] leading-5 text-fg-muted sm:hidden">En Maverlang</span>
                  <span
                    className={cn(
                      "num text-[15px] leading-5 tabular-nums",
                      row.status === "available" ? "text-fg-body" : "text-fg-muted",
                    )}
                    title="Peso en la mezcla de Maverlang"
                  >
                    {row.status === "available" ? weight(row.weightMaverlang) : "—"}
                  </span>
                </div>
              ) : null}

              <div className="col-span-2 flex items-baseline justify-between gap-2 sm:col-span-1 sm:block sm:text-right">
                <span className="text-[13px] leading-5 text-fg-muted sm:hidden">Estado</span>
                <span className="flex flex-col items-end">
                  <span className={cn("text-[13px] leading-5 font-medium", statusTone[row.status])}>
                    {statusLabel[row.status]}
                  </span>
                  {row.status === "available" && row.tradableSymbol ? (
                    <span className="num text-[13px] leading-5 text-fg-muted">{row.tradableSymbol}</span>
                  ) : null}
                </span>
              </div>

              {row.status !== "available" && row.reason ? (
                <p
                  className={cn(
                    "col-span-2 text-[13px] leading-relaxed text-fg-muted",
                    showMaverlang ? "sm:col-span-4" : "sm:col-span-3",
                  )}
                >
                  {row.reason}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {showMaverlang ? (
        <p className="border-t border-border/70 pt-3 text-[13px] leading-relaxed text-fg-muted">
          El peso de lo que no se puede comprar se reparte entre las posiciones disponibles.
        </p>
      ) : null}
    </div>
  );
}

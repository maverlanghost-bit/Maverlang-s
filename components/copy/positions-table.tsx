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
      {/* Cabecera de columnas sólo desde sm, con el dato a la vista mientras
          se recorre la lista: en móvil nada se corta ni se aprieta a 360 px. */}
      <div
        className={cn(
          "label-xs sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 hidden items-center gap-x-3 border-b border-border bg-bg pt-1 pb-2 sm:grid lg:top-16",
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
          <li key={`${row.symbol}-${index}`} className="border-b border-border/70 py-4 last:border-b-0 sm:py-3.5">
            <div
              className={cn(
                "grid grid-cols-2 items-start gap-x-4 gap-y-3 sm:items-center sm:gap-x-3 sm:gap-y-2",
                columns(showMaverlang),
              )}
            >
              <div className="col-span-2 flex min-w-0 flex-col sm:col-span-1">
                <span className="font-mono text-[15px] leading-5 font-medium break-words text-fg">
                  {row.symbol}
                </span>
                {row.name ? (
                  <span className="text-[13px] leading-5 break-words text-pretty text-fg-muted">
                    {row.name}
                  </span>
                ) : null}
              </div>

              {/* En móvil las cifras van en un bloque de dos columnas con su
                  rótulo arriba; desde sm el bloque se disuelve en la retícula. */}
              <div
                className={cn(
                  "col-span-2 grid gap-x-4 gap-y-3 sm:contents",
                  showMaverlang ? "grid-cols-2" : "grid-cols-1",
                )}
              >
                <div className="flex min-w-0 flex-col gap-0.5 sm:block sm:text-right">
                  <span className="label-xs sm:hidden">Original</span>
                  <span className="num block text-[15px] leading-5 whitespace-nowrap tabular-nums text-fg-body">
                    {weight(row.weightOriginal)}
                  </span>
                </div>

                {showMaverlang ? (
                  <div className="flex min-w-0 flex-col gap-0.5 sm:block sm:text-right">
                    <span className="label-xs sm:hidden">En Maverlang</span>
                    <span
                      className={cn(
                        "num block text-[15px] leading-5 whitespace-nowrap tabular-nums",
                        row.status === "available" ? "text-fg-body" : "text-fg-muted",
                      )}
                      title="Peso en la mezcla de Maverlang"
                    >
                      {row.status === "available" ? weight(row.weightMaverlang) : "—"}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="col-span-2 flex items-center justify-between gap-3 border-t border-border/70 pt-3 sm:col-span-1 sm:block sm:border-0 sm:pt-0 sm:text-right">
                <span className="label-xs sm:hidden">Estado</span>
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

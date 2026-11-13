import { formatFeedDate } from "@/lib/copy/lag";
import { cn } from "@/lib/cn";
import { formatPortion } from "@/lib/format";

/**
 * Movimiento tal como llega del feed. Se aceptan las dos formas (camelCase del
 * payload validado y snake_case del JSON de origen) para no romper la ficha si
 * el contrato del feed cambia de nombre en un campo.
 */
export type CopyMovementView = {
  type?: string;
  symbol?: string;
  name?: string | null;
  txDate?: string | null;
  publishedAt?: string | null;
  lagDays?: number | null;
  weightFrom?: number | null;
  weightTo?: number | null;
  sourceUrl?: string | null;
  verification?: string | null;
  tx_date?: string | null;
  published_at?: string | null;
  lag_days?: number | null;
  weight_from?: number | null;
  weight_to?: number | null;
  source_url?: string | null;
};

const deltaFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

function weight(value: number): string {
  return formatPortion(value / 100);
}

function publishedAt(row: CopyMovementView): string | null {
  return row.publishedAt ?? row.published_at ?? null;
}

function describe(row: CopyMovementView): {
  text: string;
  from: number | null;
  to: number | null;
  delta: number | null;
} {
  const from = row.weightFrom ?? row.weight_from ?? null;
  const to = row.weightTo ?? row.weight_to ?? null;
  if (from === null && to === null) {
    return { text: "Cambio de peso sin detalle en el dato", from, to, delta: null };
  }
  if (from === null && to !== null) {
    return { text: `Nueva posición con ${weight(to)}`, from, to, delta: null };
  }
  if (to === null && from !== null) {
    return { text: `Salió: tenía ${weight(from)}`, from, to, delta: null };
  }
  const safeFrom = from ?? 0;
  const safeTo = to ?? 0;
  return {
    text: `${weight(safeFrom)} → ${weight(safeTo)}`,
    from,
    to,
    delta: safeTo - safeFrom,
  };
}

/**
 * Movimientos declarados por el gestor, en filas con hairline. Sin acceso no
 * se renderiza esta lista (el paywall la reemplaza), así que nunca se filtra
 * la composición.
 */
export function MovementsList({
  movements,
  limit,
  className,
}: {
  movements: readonly CopyMovementView[];
  limit?: number;
  className?: string;
}) {
  const ordered = [...movements].sort((a, b) => {
    const left = publishedAt(a);
    const right = publishedAt(b);
    if (!left || !right) return 0;
    return Date.parse(right) - Date.parse(left);
  });
  const rows = typeof limit === "number" ? ordered.slice(0, limit) : ordered;

  if (rows.length === 0) {
    return (
      <p className={cn("text-[13px] leading-relaxed text-fg-muted", className)}>
        Sin movimientos publicados para esta cartera.
      </p>
    );
  }

  return (
    <ul
      aria-label="Movimientos de la cartera"
      className={cn("flex flex-col border-t border-border/70", className)}
    >
      {rows.map((row, index) => {
        const detail = describe(row);
        const date = publishedAt(row);
        return (
          <li
            key={`${row.symbol ?? "sin-simbolo"}-${index}`}
            className="flex flex-col gap-1 border-b border-border/70 py-3 last:border-b-0"
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 font-mono text-[15px] leading-5 font-medium break-words text-fg">
                {row.symbol ?? "—"}
              </span>
              {detail.delta !== null && detail.delta !== 0 ? (
                <span
                  className={cn(
                    "num shrink-0 text-[13px] leading-5 tabular-nums",
                    detail.delta > 0 ? "text-up" : "text-down",
                  )}
                >
                  {deltaFormatter.format(detail.delta)} pts
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="min-w-0 text-[13px] leading-5 break-words text-pretty text-fg-body">
                {detail.text}
              </span>
              {date ? (
                <span className="num shrink-0 text-[13px] leading-5 whitespace-nowrap tabular-nums text-fg-muted">
                  Publicado {formatFeedDate(date)}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

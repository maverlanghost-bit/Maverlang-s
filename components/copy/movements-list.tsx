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
 * Movimientos declarados por el gestor. Sin acceso no se renderiza esta lista
 * (el paywall la reemplaza), así que nunca se filtra la composición.
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
      <p className={cn("text-sm leading-relaxed text-fg-muted", className)}>
        Sin movimientos publicados para esta cartera.
      </p>
    );
  }

  return (
    <ul aria-label="Movimientos de la cartera" className={cn("flex flex-col", className)}>
      {rows.map((row, index) => {
        const detail = describe(row);
        const date = publishedAt(row);
        return (
          <li
            key={`${row.symbol ?? "sin-simbolo"}-${index}`}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border/70 py-2.5 first:border-t-0"
          >
            <span className="font-mono text-sm text-fg">{row.symbol ?? "—"}</span>
            <span className="min-w-0 flex-1 text-sm text-fg-body">{detail.text}</span>
            {detail.delta !== null && detail.delta !== 0 ? (
              <span
                className={cn(
                  "font-mono text-xs tabular-nums",
                  detail.delta > 0 ? "text-up" : "text-down",
                )}
              >
                {deltaFormatter.format(detail.delta)} pts
              </span>
            ) : null}
            {date ? (
              <span className="w-full text-xs text-fg-muted sm:w-auto">
                Publicado {formatFeedDate(date)}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

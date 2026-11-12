import { cn } from "@/lib/cn";

/**
 * Lista clave/valor de una cotización. Siempre visible antes de confirmar.
 *
 * Filas separadas por hairlines, sin cajas ni fondos: la jerarquía la dan el
 * espaciado y el peso del total. `rows` se mantiene igual para el resto de las
 * hojas (envío y cripto) que ya la consumen.
 */
export function CostBreakdown({
  rows,
  total,
  className,
}: {
  rows: readonly { label: string; value: string }[];
  /** Fila final destacada: total estimado a pagar o a recibir. */
  total?: { label: string; value: string };
  className?: string;
}) {
  return (
    <dl className={cn("min-w-0 border-t border-border", className)}>
      {rows.map((row, index) => (
        <div
          key={row.label}
          className={cn(
            "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-2.5",
            index > 0 && "border-t border-border/70",
          )}
        >
          <dt className="min-w-0 text-[13px] leading-5 text-fg-muted">{row.label}</dt>
          <dd className="num text-right text-sm leading-5 text-fg">{row.value}</dd>
        </div>
      ))}
      {total ? (
        <div className="mt-0.5 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-t border-fg/20 pt-3 pb-0.5">
          <dt className="min-w-0 text-sm font-medium text-fg">{total.label}</dt>
          <dd className="num text-right text-[15px] font-medium text-fg">{total.value}</dd>
        </div>
      ) : null}
    </dl>
  );
}

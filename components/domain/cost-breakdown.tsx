/** Lista clave/valor de una cotización. Siempre visible antes de confirmar. */
export function CostBreakdown({ rows }: { rows: readonly { label: string; value: string }[] }) {
  return (
    <dl className="flex flex-col gap-3 border-t border-border pt-4 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4">
          <dt className="text-fg-muted">{row.label}</dt>
          <dd className="num text-right text-fg">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

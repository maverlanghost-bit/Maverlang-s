import type { ReactNode } from "react";

/** Display only: quantities and guards remain owned by the operation flow. */
export function QuoteExchangeSummary({ from, to, fromLabel, toLabel, label, note }: {
  from: ReactNode; to: ReactNode; fromLabel: string; toLabel: string; label: string; note?: string;
}) {
  return <section aria-label={label} className="rounded-xl border border-border bg-surface-1 p-4">
    <dl className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-2"><dt className="text-sm text-fg-muted">{fromLabel}</dt><dd className="num min-w-0 text-right text-xl leading-snug break-words text-fg">{from}</dd></div>
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t border-border pt-4"><dt className="text-sm text-fg-muted">{toLabel}</dt><dd className="num min-w-0 text-right text-2xl leading-snug break-words text-fg">{to}</dd></div>
    </dl>
    {note ? <p className="mt-3 text-xs leading-relaxed text-fg-muted">{note}</p> : null}
  </section>;
}

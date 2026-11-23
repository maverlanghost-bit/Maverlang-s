import type { ReactNode } from "react";

/**
 * Resumen de la cotización: lo que recibes en grande, lo que pagas debajo y los
 * costos en una lista compacta. Sólo muestra; las cantidades y las
 * validaciones las decide el flujo de la operación. `footer` aloja la vigencia.
 */
export function QuoteExchangeSummary({ from, to, fromLabel, toLabel, label, feeLabel, fees, footer }: {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  label: string;
  feeLabel: string;
  fees?: readonly { label: string; value: string }[];
  footer?: ReactNode;
}) {
  return (
    <section aria-label={label} className="overflow-hidden rounded-2xl bg-surface-1">
      <dl className="px-4 pt-4 pb-3.5">
        <dt className="label">{toLabel}</dt>
        <dd className="num mt-1.5 text-[2rem] leading-tight font-medium tracking-[-0.02em] break-words text-fg">{to}</dd>
        <div className="mt-3.5 flex items-baseline justify-between gap-4 border-t border-border pt-3">
          <dt className="text-[13px] leading-5 text-fg-muted">{fromLabel}</dt>
          <dd className="num text-right text-[15px] leading-5 font-medium break-words text-fg">{from}</dd>
        </div>
      </dl>
      {fees?.length || footer ? (
        <div className="border-t border-border px-4 py-3">
          {fees?.length ? (
            <>
              <h3 className="label">{feeLabel}</h3>
              <dl className="mt-2 flex flex-col gap-1">
                {fees.map((fee) => (
                  <div key={fee.label} className="flex min-h-6 items-baseline justify-between gap-4">
                    <dt className="min-w-0 text-[13px] leading-5 text-fg-muted">{fee.label}</dt>
                    <dd className="num text-right text-[13px] leading-5 text-fg">{fee.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
          {footer ? <div className={fees?.length ? "mt-2 border-t border-border pt-2" : ""}>{footer}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

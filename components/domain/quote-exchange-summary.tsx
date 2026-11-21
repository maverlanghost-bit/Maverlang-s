import { CostBreakdown } from "@/components/domain/cost-breakdown";
import { IconBack } from "@/components/ui/icons";

/** Display only: quantities and guards remain owned by the operation flow. */
export function QuoteExchangeSummary({ from, to, fromLabel, toLabel, label, feeLabel, fees }: {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  label: string;
  feeLabel: string;
  fees?: readonly { label: string; value: string }[];
}) {
  return (
    <section aria-label={label} className="overflow-hidden rounded-2xl border border-border bg-bg">
      <div className="bg-surface-1 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-fg">{label}</h3>
        <dl className="relative mt-3 grid min-w-0 gap-2">
          <div className="min-w-0 rounded-xl border border-border bg-bg px-4 py-3">
            <dt className="text-xs text-fg-muted">{fromLabel}</dt>
            <dd className="num mt-1 text-xl leading-tight font-medium break-words text-fg">{from}</dd>
          </div>
          <div className="relative min-w-0 rounded-xl border border-border bg-bg px-4 py-3">
            <span aria-hidden="true" className="absolute -top-[17px] right-3 grid size-6 place-items-center rounded-full border border-border bg-bg text-fg-muted">
              <IconBack className="size-3 -rotate-90" />
            </span>
            <dt className="text-xs text-fg-muted">{toLabel}</dt>
            <dd className="num mt-1 text-2xl leading-tight font-semibold break-words text-fg">{to}</dd>
          </div>
        </dl>
      </div>
      {fees?.length ? (
        <div className="border-t border-border px-4 pt-4 pb-1 sm:px-5">
          <h4 className="text-xs font-semibold text-fg">{feeLabel}</h4>
          <CostBreakdown rows={fees} className="border-t-0" />
        </div>
      ) : null}
    </section>
  );
}

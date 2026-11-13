"use client";

import { InfoTip } from "@/components/domain/info-tip";
import { Skeleton } from "@/components/ui/skeleton";
import { carteraCopy } from "@/content/i18n/extra-cartera";
import { formatDateTime, formatMoney, type MoneyCurrency } from "@/lib/format";
import { useFx, useHistory } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice } from "@/lib/market/browse";
import { gapPercentText, tokenStockGap } from "@/lib/portfolio/token-gap";
import type { Currency, Quote } from "@/lib/types";

function shownMoney(usd: number, currency: Currency, rate: number | undefined): { amount: number; currency: MoneyCurrency } {
  if (currency === "CLP") {
    const converted = displayPrice(usd, "CLP", rate);
    if (converted !== null) return { amount: converted, currency: "CLP" };
  }
  return { amount: usd, currency: "USD" };
}

function GapLine({ template, pct }: { template: string; pct: string }) {
  const marker = "{pct}";
  const index = template.indexOf(marker);
  const figure = <span className="num font-medium text-fg">{pct}</span>;
  if (index < 0) {
    return (
      <>
        {template} {figure}
      </>
    );
  }
  return (
    <>
      {template.slice(0, index)}
      {figure}
      {template.slice(index + marker.length)}
    </>
  );
}

function GapSkeleton({ label }: { label: string }) {
  return (
    <section className="border-t border-border pt-8" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-5 w-44 max-w-full" />
      <Skeleton className="mt-3 h-4 w-4/5 max-w-sm" />
      <div className="mt-5 grid grid-cols-2 gap-x-6 sm:gap-x-8">
        {["a", "b"].map((key) => (
          <div key={key} className="border-t border-border/70 py-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-5 w-24" />
            <Skeleton className="mt-1.5 h-3 w-16" />
          </div>
        ))}
      </div>
    </section>
  );
}

function PriceColumn({
  label,
  amount,
  pending,
  at,
}: {
  label: string;
  amount: string;
  pending: boolean;
  at: string | null;
}) {
  return (
    <div className="min-w-0 border-t border-border/70 py-3">
      <dt className="label-xs">{label}</dt>
      <dd className="num mt-1 text-base leading-6 font-medium text-fg">
        {pending ? <Skeleton className="h-5 w-24" /> : amount}
      </dd>
      <dd className="num mt-0.5 min-h-4 text-xs leading-4 text-fg-muted">{at ? formatDateTime(at) : null}</dd>
    </div>
  );
}

/**
 * Precio del token (quote de la app, no la ancla) contra el último cierre
 * real de 1M. Si el historial no es `closes` o falta un precio, no se pinta.
 */
export function TokenGapCard({ symbol, quote }: { symbol: string; quote: Quote | null }) {
  const { t, language, currency } = useT();
  const copy = carteraCopy(language);
  const fx = useFx();
  const history = useHistory(symbol, "1M");
  const tokenUsd =
    quote && quote.source !== "mock" && quote.reference !== true && Number.isFinite(quote.priceUsd) && quote.priceUsd > 0
      ? quote.priceUsd
      : null;
  const gap = tokenStockGap({
    tokenUsd,
    tokenAt: quote?.updatedAt,
    source: history.data?.source,
    points: history.data?.points,
  });
  if (tokenUsd === null) return null;
  if (!gap && history.isPending) return <GapSkeleton label={t.states.loading} />;
  if (!gap) return null;

  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const pendingFx = currency === "CLP" && !fxKnown && fx.isPending;
  const tokenView = shownMoney(gap.tokenUsd, currency, rate);
  const closeView = shownMoney(gap.closeUsd, currency, rate);
  const template = gap.side === "above" ? copy.gapAbove : gap.side === "below" ? copy.gapBelow : copy.gapEven;

  return (
    <section className="border-t border-border pt-8" data-token-gap={symbol}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-lg font-medium tracking-tight text-fg">{copy.gapTitle}</h2>
        <InfoTip className="-mt-1 shrink-0" label={`${copy.whatIsThis}. ${copy.gapTitle}`} text={`${copy.gapTip} ${copy.gapWhy}`} />
      </div>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-pretty text-fg-body">
        <GapLine template={template} pct={gapPercentText(gap.diffPct)} />
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 sm:gap-x-8">
        <PriceColumn
          label={copy.gapToken}
          amount={formatMoney(tokenView.amount, tokenView.currency)}
          pending={pendingFx}
          at={gap.tokenAt}
        />
        <PriceColumn
          label={copy.gapClose}
          amount={formatMoney(closeView.amount, closeView.currency)}
          pending={pendingFx}
          at={gap.closeAt}
        />
      </dl>
    </section>
  );
}

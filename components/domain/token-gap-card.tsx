"use client";

import { InfoTip } from "@/components/domain/info-tip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
  const badge = (
    <Badge tone="neutral" className="mx-0.5 align-middle">
      {pct}
    </Badge>
  );
  if (index < 0) {
    return (
      <>
        {template} {badge}
      </>
    );
  }
  return (
    <>
      {template.slice(0, index)}
      {badge}
      {template.slice(index + marker.length)}
    </>
  );
}

function GapSkeleton({ label }: { label: string }) {
  return (
    <Card className="flex flex-col gap-3 p-4" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-5 w-4/5 max-w-sm" />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-1 h-5 w-24" />
          <Skeleton className="mt-1 h-3 w-20" />
        </div>
        <div>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-1 h-5 w-24" />
          <Skeleton className="mt-1 h-3 w-20" />
        </div>
      </div>
    </Card>
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
    <div className="min-w-0">
      <dt className="text-xs font-medium leading-4 tracking-tight whitespace-nowrap text-fg-muted">{label}</dt>
      <dd className="num mt-0.5 text-sm text-fg">{pending ? <Skeleton className="h-5 w-24" /> : amount}</dd>
      <dd className="mt-0.5 min-h-4 text-[11px] leading-4 text-fg-muted">{at ? formatDateTime(at) : null}</dd>
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
    <Card className="flex flex-col gap-3 p-4" data-token-gap={symbol}>
      <div className="flex items-start gap-1">
        <p className="min-w-0 flex-1 text-sm leading-5 text-pretty text-fg">
          <GapLine template={template} pct={gapPercentText(gap.diffPct)} />
        </p>
        <InfoTip className="-mt-1.5 -mr-1.5 shrink-0" label={`${copy.whatIsThis}. ${copy.gapTitle}`} text={`${copy.gapTip} ${copy.gapWhy}`} />
      </div>
      <dl className="grid grid-cols-2 gap-3">
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
    </Card>
  );
}

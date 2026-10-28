"use client";

import { InfoTip } from "@/components/domain/info-tip";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { carteraCopy } from "@/content/i18n/extra-cartera";
import { formatDateTime, formatMoney, type MoneyCurrency } from "@/lib/format";
import { useFx, useHistory } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice } from "@/lib/market/browse";
import { gapPercentText, tokenStockGap } from "@/lib/portfolio/token-gap";
import type { Currency, Quote } from "@/lib/types";

function fill(template: string, values: Record<string, string>) {
  let next = template;
  for (const [key, value] of Object.entries(values)) next = next.split(`{${key}}`).join(value);
  return next;
}

function shownMoney(usd: number, currency: Currency, rate: number | undefined): { amount: number; currency: MoneyCurrency } {
  if (currency === "CLP") {
    const converted = displayPrice(usd, "CLP", rate);
    if (converted !== null) return { amount: converted, currency: "CLP" };
  }
  return { amount: usd, currency: "USD" };
}

/**
 * Precio del token (quote de la app, no la ancla) contra el último cierre
 * real de 1M. Si el historial no es `closes` o falta un precio, no se pinta.
 */
export function TokenGapCard({ symbol, quote }: { symbol: string; quote: Quote | null }) {
  const { language, currency } = useT();
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
  if (!gap) return null;

  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const pendingFx = currency === "CLP" && !fxKnown && fx.isPending;
  const tokenView = shownMoney(gap.tokenUsd, currency, rate);
  const closeView = shownMoney(gap.closeUsd, currency, rate);
  const sentence =
    gap.side === "above"
      ? fill(copy.gapAbove, { pct: gapPercentText(gap.diffPct) })
      : gap.side === "below"
        ? fill(copy.gapBelow, { pct: gapPercentText(gap.diffPct) })
        : copy.gapEven;

  return (
    <Card className="flex flex-col gap-4 p-5 md:p-6" data-token-gap={symbol}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{copy.gapTitle}</h2>
        <InfoTip label={`${copy.whatIsThis}. ${copy.gapTitle}`} text={copy.gapTip} />
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="label">{copy.gapToken}</dt>
          <dd className="num mt-1 text-sm text-fg">
            {pendingFx ? <Skeleton className="h-5 w-24" /> : formatMoney(tokenView.amount, tokenView.currency)}
          </dd>
          {gap.tokenAt ? <dd className="mt-1 text-xs leading-relaxed text-fg-muted">{formatDateTime(gap.tokenAt)}</dd> : null}
        </div>
        <div>
          <dt className="label">{copy.gapClose}</dt>
          <dd className="num mt-1 text-sm text-fg">
            {pendingFx ? <Skeleton className="h-5 w-24" /> : formatMoney(closeView.amount, closeView.currency)}
          </dd>
          {gap.closeAt ? <dd className="mt-1 text-xs leading-relaxed text-fg-muted">{formatDateTime(gap.closeAt)}</dd> : null}
        </div>
      </dl>
      <p className="text-sm leading-relaxed text-fg-body">{sentence}</p>
      <p className="text-sm leading-relaxed text-fg-muted">{copy.gapWhy}</p>
    </Card>
  );
}

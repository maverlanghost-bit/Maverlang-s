"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { BentoCard } from "@/components/landing/bento";
import { SvgPriceChart, type ChartPoint } from "@/components/domain/svg-price-chart";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { PriceText } from "@/components/domain/price-text";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { RANGE_OPTIONS } from "@/components/landing/landing-quote-preview";
import { useLandingQuote } from "@/components/landing/live-landing-prices";
import { Skeleton } from "@/components/ui/skeleton";
import { historyDescription, observedSeries } from "@/lib/charts/data";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { useHistory } from "@/lib/hooks/queries";
import type { LandingQuote } from "@/lib/mocks/landing";
import type { Range } from "@/lib/types";

const CHART_HEIGHT = "h-44 sm:h-52";

/**
 * Ficha con gráfico del bento del hero (T70). Versión compacta de
 * `LandingQuotePreview`: mismo origen de datos (`useLandingQuote` para precio y
 * variación, `useHistory` para el período) y misma regla: nunca se dibuja una
 * serie que la fuente no entregó. Cargando, un esqueleto; sin puntos, una sola
 * línea que lo dice.
 */
export function HeroQuoteCard({
  quote,
  live,
  className,
}: {
  quote: LandingQuote;
  live: boolean;
  className?: string;
}) {
  const current = useLandingQuote(quote.symbol, { priceUsd: quote.priceUsd, change: quote.change });
  const { priceUsd, change, stale, demo, reference, updatedAt } = current;

  const [range, setRange] = useState<Range>("1M");
  const history = useHistory(quote.symbol, range);
  const rangeName = RANGE_OPTIONS.find((option) => option.value === range)?.name ?? "";

  const chartData = useMemo<ChartPoint[]>(() => {
    const rows = observedSeries(history.data?.points ?? []);
    return rows.length >= 2 ? rows : [];
  }, [history.data]);

  const first = chartData[0]?.p;
  const last = chartData[chartData.length - 1]?.p;
  const periodChange =
    first !== undefined && last !== undefined && first > 0 ? (last - first) / first : null;

  const historyIsReference = history.data?.source !== "ticks" || history.data?.real !== true;
  const priceState = demo
    ? "Precio ilustrativo"
    : reference
      ? "Precio de referencia"
      : stale
        ? "Último precio conocido"
        : "Cotización del token";

  return (
    <BentoCard padded={false} className={className}>
      <div className="flex h-full flex-col gap-5 p-5 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <TickerLogo
              symbol={quote.symbol}
              name={quote.name}
              logoUrl={quote.logo}
              size={40}
              decorative
              loading="lazy"
              sizes="40px"
            />
            <div className="min-w-0">
              <h2
                title={quote.name}
                className="truncate text-lg leading-snug font-semibold tracking-tight text-fg"
              >
                {quote.name}
              </h2>
              <p className="truncate text-sm leading-snug text-fg-muted">
                {quote.symbol} · {quote.underlying}
              </p>
            </div>
          </div>

          <div className="min-w-0 sm:text-right">
            <PriceText
              value={priceUsd}
              currency="USD"
              size="md"
              live={live && current.source === "jupiter" && !reference && !stale}
              className="block whitespace-nowrap"
            />
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm sm:justify-end">
              <span
                className={cn(
                  "num font-medium",
                  change > 0 ? "text-up" : change < 0 ? "text-down" : "text-fg-muted",
                )}
              >
                <span className="sr-only">{change > 0 ? "Sube " : change < 0 ? "Baja " : "Sin cambio "}</span>
                {formatPercent(change)}
              </span>
              <span className="text-fg-muted">24 h · {priceState} · USD</span>
            </p>
            {!demo && !reference ? <PriceFreshness at={updatedAt} stale={stale} className="mt-1" /> : null}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-x-4 border-b border-border pb-1">
            <p className="min-w-0 text-sm text-fg-muted">
              {historyDescription(history.data?.source, false)} · {rangeName}
            </p>
            <div role="group" aria-label="Rango del gráfico" className="-mr-2 flex items-center gap-0.5">
              {RANGE_OPTIONS.map((option) => {
                const active = option.value === range;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRange(option.value)}
                    className={cn(
                      "inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-sm font-medium transition-colors",
                      active
                        ? "text-fg underline decoration-fg underline-offset-4"
                        : "text-fg-muted hover:text-fg",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            {history.isPending ? (
              <>
                <Skeleton className={`w-full ${CHART_HEIGHT}`} />
                <p role="status" className="sr-only">
                  Cargando historial
                </p>
              </>
            ) : (
              <SvgPriceChart
                points={chartData}
                tone={periodChange === null ? "flat" : periodChange >= 0 ? "up" : "down"}
                label={`Historial de ${quote.name} en ${rangeName}`}
                emptyLabel="Sin historial disponible"
                emptyHint="La fuente no entregó puntos para este período."
                onHover={() => undefined}
                heightClassName={CHART_HEIGHT}
                reference={historyIsReference}
                showExtremes={false}
              />
            )}
          </div>
        </div>

        <Link
          href={quote.href}
          className="mt-auto inline-flex min-h-11 w-fit items-center text-sm font-medium text-fg"
        >
          <span className="border-b border-border-strong pb-0.5 transition-colors hover:border-fg">
            Ver ficha de {quote.symbol} →
          </span>
        </Link>
      </div>
    </BentoCard>
  );
}

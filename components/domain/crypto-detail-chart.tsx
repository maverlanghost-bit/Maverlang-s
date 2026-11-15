"use client";

import { useCallback, useMemo, useState } from "react";

import { ChangeBadge } from "@/components/domain/change-badge";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { SvgPriceChart } from "@/components/domain/svg-price-chart";
import { ErrorState } from "@/components/ui/error-state";
import { indexFromKey } from "@/components/ui/keys";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { SPOT_MS, useFx, useHistory, usePrices } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice } from "@/lib/market/browse";
import type { Currency, PricePoint, Quote, Range } from "@/lib/types";

type RangeOption = {
  value: Range;
  labelEs: string;
  labelEn: string;
  ariaEs: string;
  ariaEn: string;
};

const CRYPTO_RANGES: readonly RangeOption[] = [
  { value: "1D", labelEs: "1D", labelEn: "1D", ariaEs: "Últimas 24 horas", ariaEn: "Last 24 hours" },
  { value: "1W", labelEs: "1S", labelEn: "1W", ariaEs: "Última semana", ariaEn: "Last week" },
  { value: "1M", labelEs: "1M", labelEn: "1M", ariaEs: "Último mes", ariaEn: "Last month" },
  { value: "1Y", labelEs: "1A", labelEn: "1Y", ariaEs: "Último año", ariaEn: "Last year" },
];

function isUsableQuote(quote: Quote): boolean {
  return (
    (quote.source === "jupiter" || quote.source === "mock") &&
    quote.reference !== true &&
    Number.isFinite(quote.priceUsd) &&
    quote.priceUsd > 0
  );
}

function usdDecimalsFor(value: number): number {
  const abs = Math.abs(value);
  if (abs === 0) return 2;
  if (abs >= 1) return 2;
  if (abs >= 0.01) return 4;
  if (abs >= 0.0001) return 6;
  return 8;
}

function clpDecimalsFor(value: number): number {
  const abs = Math.abs(value);
  if (abs === 0) return 0;
  if (abs >= 10) return 0;
  if (abs >= 1) return 2;
  if (abs >= 0.01) return 4;
  return 6;
}

function formatCryptoPrice(
  value: number,
  currency: Currency,
  language: "es-CL" | "en",
): string {
  if (!Number.isFinite(value)) return "—";
  if (currency === "CLP") {
    const decimals = clpDecimalsFor(value);
    return new Intl.NumberFormat(language, {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }
  const decimals = usdDecimalsFor(value);
  const formatted = new Intl.NumberFormat(language, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return formatted;
}

function formatCompactUsd(value: number, language: "es-CL" | "en"): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return new Intl.NumberFormat(language, {
    style: "currency",
    currency: "USD",
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10_000 ? 2 : 0,
  }).format(value);
}

function normalizePoints(points: readonly PricePoint[] | undefined): PricePoint[] {
  if (!points || points.length === 0) return [];
  const filtered = points.filter(
    (point) => Number.isFinite(point.t) && Number.isFinite(point.p) && point.p > 0,
  );
  if (filtered.length === 0) return [];
  const sorted = [...filtered].sort((a, b) => a.t - b.t);
  const deduped: PricePoint[] = [];
  for (const point of sorted) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.t === point.t) {
      deduped[deduped.length - 1] = point;
    } else {
      deduped.push(point);
    }
  }
  return deduped;
}

export function CryptoDetailChart({ symbol, name }: { symbol: string; name: string }) {
  const { language, currency } = useT();
  const isEn = language === "en";
  const [range, setRange] = useState<Range>("1M");
  const [hover, setHover] = useState<{
    key: string;
    usd: number;
    timeMs: number | null;
  } | null>(null);

  const symbols = useMemo(() => [symbol], [symbol]);
  const pricesQuery = usePrices(symbols, true, SPOT_MS);
  const historyQuery = useHistory(symbol, range);
  const fxQuery = useFx();

  const fxRate = useMemo(() => {
    const raw = fxQuery.data?.rate;
    return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : undefined;
  }, [fxQuery.data]);

  const effectiveCurrency: Currency = currency === "CLP" && fxRate ? "CLP" : "USD";
  const waitingClpRate = currency === "CLP" && !fxRate;

  const quote = useMemo(() => {
    const rows = pricesQuery.data;
    if (!rows) return null;
    const upper = symbol.toUpperCase();
    const match = rows.find((row) => row.symbol.toUpperCase() === upper);
    if (!match || !isUsableQuote(match)) return null;
    return match;
  }, [pricesQuery.data, symbol]);

  const rawPoints = historyQuery.data?.points;
  const validPoints = useMemo(() => normalizePoints(rawPoints), [rawPoints]);

  const livePoint = useMemo<PricePoint | undefined>(() => {
    if (!quote || validPoints.length === 0) return undefined;
    const parsedTime = Date.parse(quote.updatedAt);
    const last = validPoints[validPoints.length - 1];
    const t =
      Number.isFinite(parsedTime) && parsedTime > last.t
        ? parsedTime
        : last.t + 1;
    return { t, p: quote.priceUsd };
  }, [quote, validPoints]);

  const seriesStats = useMemo(() => {
    if (validPoints.length < 2) return null;
    const allPrices = livePoint
      ? [...validPoints.map((pt) => pt.p), livePoint.p]
      : validPoints.map((pt) => pt.p);
    const first = allPrices[0] ?? 0;
    const last = allPrices[allPrices.length - 1] ?? 0;
    let min = Infinity;
    let max = -Infinity;
    for (const value of allPrices) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const changePct = first > 0 ? (last - first) / first : 0;
    return {
      minUsd: min,
      maxUsd: max,
      changePct,
    };
  }, [validPoints, livePoint]);

  const seriesKey = `${symbol}:${range}:${validPoints.length}`;

  const handleHover = useCallback(
    (usd: number | null, timeMs?: number | null) => {
      if (usd === null) {
        setHover(null);
        return;
      }
      setHover({ key: seriesKey, usd, timeMs: timeMs ?? null });
    },
    [seriesKey],
  );

  const activeHover = hover && hover.key === seriesKey ? hover : null;
  const displayedUsd = activeHover ? activeHover.usd : quote?.priceUsd ?? null;
  const displayedValue =
    displayedUsd !== null ? displayPrice(displayedUsd, effectiveCurrency, fxRate) : null;

  const secondaryLabel = useMemo(() => {
    if (displayedUsd === null) return null;
    if (effectiveCurrency === "CLP") {
      return formatCryptoPrice(displayedUsd, "USD", language);
    }
    if (fxRate) {
      const clp = displayPrice(displayedUsd, "CLP", fxRate);
      if (clp !== null) return formatCryptoPrice(clp, "CLP", language);
    }
    return null;
  }, [displayedUsd, effectiveCurrency, fxRate, language]);

  const tone: "up" | "down" | "flat" = useMemo(() => {
    const pct = seriesStats ? seriesStats.changePct : quote?.change24hPct ?? 0;
    if (pct > 0.0005) return "up";
    if (pct < -0.0005) return "down";
    return "flat";
  }, [seriesStats, quote]);

  const activeRangeMeta =
    CRYPTO_RANGES.find((item) => item.value === range) ?? CRYPTO_RANGES[2];
  const activeRangeLabel = isEn ? activeRangeMeta.labelEn : activeRangeMeta.labelEs;

  const hasChartSeries = validPoints.length >= 2;
  const isMockSeries = historyQuery.data?.source === "mock";
  const isLiveTicks = historyQuery.data?.source === "ticks";

  const sourceBadgeLabel = useMemo(() => {
    if (!quote) return null;
    if (quote.source === "jupiter") return "Jupiter · Solana";
    return isEn ? "Demo quote" : "Precio demo";
  }, [quote, isEn]);

  return (
    <section
      aria-labelledby="precio-cripto-vivo"
      className="flex flex-col gap-5 rounded-xl border border-border bg-surface-1 p-5 sm:p-6"
    >
      {/* Spot en vivo + cambio 24h + estado de frescura */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="precio-cripto-vivo"
              className="text-xs font-medium tracking-wider text-fg-muted uppercase"
            >
              {isEn ? "Live price" : "Precio en vivo"} · {symbol}
            </h2>
            {sourceBadgeLabel ? (
              <span className="inline-flex items-center rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-body">
                {sourceBadgeLabel}
              </span>
            ) : null}
            <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-medium text-fg-muted">
              {effectiveCurrency}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            {pricesQuery.isPending && !quote ? (
              <div
                aria-hidden
                className="h-10 w-44 animate-pulse rounded-md bg-surface-2"
              />
            ) : displayedValue !== null ? (
              <p className="num text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                {formatCryptoPrice(displayedValue, effectiveCurrency, language)}
              </p>
            ) : (
              <p className="text-2xl font-medium tracking-tight text-fg-muted">
                {isEn ? "Quote unavailable" : "Sin cotización en vivo"}
              </p>
            )}

            {quote ? (
              <div className="flex items-center gap-2">
                <ChangeBadge value={quote.change24hPct} size="md" />
                <span className="text-xs text-fg-muted">24h</span>
              </div>
            ) : null}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
            {activeHover?.timeMs ? (
              <span className="font-medium text-fg-body">
                {formatDateTime(new Date(activeHover.timeMs).toISOString())}
              </span>
            ) : (
              <>
                {secondaryLabel ? <span className="num">≈ {secondaryLabel}</span> : null}
                {waitingClpRate ? (
                  <span>
                    {isEn
                      ? "Loading USD/CLP rate, showing USD"
                      : "Cargando dólar, mostrando USD"}
                  </span>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <PriceFreshness
            at={quote?.updatedAt ?? null}
            stale={quote?.stale}
            live={quote?.source === "jupiter" && !quote?.stale}
          />
          {quote?.liquidityUsd && quote.liquidityUsd > 0 ? (
            <p className="num text-xs text-fg-muted">
              {isEn ? "Liquidity" : "Liquidez DEX"}:{" "}
              <span className="font-medium text-fg-body">
                {formatCompactUsd(quote.liquidityUsd, language)}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {/* Selector de rango */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
        <div
          role="radiogroup"
          aria-label={isEn ? "Chart range" : "Rango del gráfico"}
          className="inline-flex items-center gap-1 rounded-lg bg-surface-2 p-1"
        >
          {CRYPTO_RANGES.map((option, index) => {
            const selected = option.value === range;
            const label = isEn ? option.labelEn : option.labelEs;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={isEn ? option.ariaEn : option.ariaEs}
                tabIndex={selected ? 0 : -1}
                onClick={() => setRange(option.value)}
                onKeyDown={(e) => {
                  const next = indexFromKey(e.key, index, CRYPTO_RANGES.length);
                  if (next !== null) {
                    e.preventDefault();
                    setRange(CRYPTO_RANGES[next].value);
                  }
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  selected
                    ? "bg-bg text-fg shadow-xs"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {seriesStats ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <span>{isEn ? `Range ${activeRangeLabel}` : `Rango ${activeRangeLabel}`}:</span>
              <ChangeBadge value={seriesStats.changePct} size="sm" />
            </span>
            {(() => {
              const minDisplay = displayPrice(seriesStats.minUsd, effectiveCurrency, fxRate);
              const maxDisplay = displayPrice(seriesStats.maxUsd, effectiveCurrency, fxRate);
              if (minDisplay === null || maxDisplay === null) return null;
              return (
                <span className="num">
                  {isEn ? "Min" : "Mín"}{" "}
                  <span className="text-fg-body">
                    {formatCryptoPrice(minDisplay, effectiveCurrency, language)}
                  </span>{" "}
                  · {isEn ? "Max" : "Máx"}{" "}
                  <span className="text-fg-body">
                    {formatCryptoPrice(maxDisplay, effectiveCurrency, language)}
                  </span>
                </span>
              );
            })()}
          </div>
        ) : null}
      </div>

      {/* Área de gráfico o tarjeta honesta de precio en vivo */}
      {pricesQuery.isError && !quote ? (
        <ErrorState
          title={isEn ? "Couldn't load live price" : "No pudimos cargar el precio en vivo"}
          description={
            isEn
              ? "Check your connection or try again in a few seconds."
              : "Revisa tu conexión o vuelve a intentarlo en unos segundos."
          }
          onRetry={() => {
            void pricesQuery.refetch();
            void historyQuery.refetch();
          }}
          retryLabel={isEn ? "Retry" : "Reintentar"}
        />
      ) : historyQuery.isPending ? (
        <div
          aria-busy="true"
          aria-label={isEn ? "Loading chart" : "Cargando historial de precio"}
          className="flex h-56 flex-col justify-between rounded-lg border border-border bg-bg p-4 sm:h-64"
        >
          <div className="h-3 w-32 animate-pulse rounded bg-surface-2" />
          <div className="h-24 w-full animate-pulse rounded bg-surface-2/60" />
          <div className="flex justify-between">
            <div className="h-3 w-16 animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-16 animate-pulse rounded bg-surface-2" />
          </div>
        </div>
      ) : historyQuery.isError && !hasChartSeries ? (
        <ErrorState
          title={
            isEn
              ? "Couldn't load price history"
              : "No pudimos cargar el historial de precio"
          }
          description={
            isEn
              ? "Live spot pricing remains active above."
              : "El precio spot en vivo sigue disponible arriba."
          }
          onRetry={() => {
            void historyQuery.refetch();
          }}
          retryLabel={isEn ? "Retry history" : "Reintentar historial"}
        />
      ) : hasChartSeries ? (
        <div className="flex flex-col gap-2">
          <SvgPriceChart
            points={validPoints}
            livePoint={livePoint}
            tone={tone}
            label={
              isEn
                ? `${name} (${symbol}) price chart — ${activeRangeLabel}`
                : `Gráfico de precio de ${name} (${symbol}) — ${activeRangeLabel}`
            }
            emptyLabel={
              isEn ? "No history available" : "Sin historial disponible"
            }
            onHover={handleHover}
            showGrid
            showExtremes
            heightClassName="h-56 sm:h-64"
          />
          <p className="text-[11px] leading-relaxed text-fg-muted">
            {isLiveTicks
              ? isEn
                ? `Chart built from stored ${symbol} ticks in USD and anchored to live Jupiter spot.`
                : `Curva construida con registros reales de ${symbol} en USD y anclada al precio vivo actual.`
              : isMockSeries
                ? isEn
                  ? `Demo series for ${symbol} (${activeRangeLabel}) anchored to reference spot.`
                  : `Serie de demostración para ${symbol} (${activeRangeLabel}) en modo demo.`
                : isEn
                  ? `Stored closes for ${symbol} (${activeRangeLabel}).`
                  : `Cierres almacenados para ${symbol} (${activeRangeLabel}).`}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border-strong bg-bg p-5">
          <p className="text-sm font-medium text-fg">
            {isEn
              ? `No historical curve for ${symbol} (${activeRangeLabel})`
              : `Sin curva histórica de ${symbol} en ${activeRangeLabel}`}
          </p>
          <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-fg-body">
            {isEn
              ? "We do not have enough stored ticks for this range yet. We show the real live quote above without inventing chart points."
              : `Todavía no acumulamos suficientes registros históricos de ${symbol} para ${activeRangeLabel}. Mostramos el precio real en vivo arriba sin rellenar el gráfico con curvas inventadas.`}
          </p>
          {quote ? (
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-fg-muted">{isEn ? "Live spot (USD)" : "Spot en vivo (USD)"}</dt>
                <dd className="num mt-0.5 font-medium text-fg">
                  {formatCryptoPrice(quote.priceUsd, "USD", language)}
                </dd>
              </div>
              {fxRate ? (
                <div>
                  <dt className="text-fg-muted">
                    {isEn ? "Equivalent (CLP)" : "Equivalente (CLP)"}
                  </dt>
                  <dd className="num mt-0.5 font-medium text-fg">
                    {(() => {
                      const clp = displayPrice(quote.priceUsd, "CLP", fxRate);
                      return clp !== null
                        ? formatCryptoPrice(clp, "CLP", language)
                        : "—";
                    })()}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-fg-muted">{isEn ? "24h change" : "Cambio 24h"}</dt>
                <dd className="mt-1">
                  <ChangeBadge value={quote.change24hPct} size="sm" />
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      )}
    </section>
  );
}

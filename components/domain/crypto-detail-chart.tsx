"use client";

import { useCallback, useMemo, useState } from "react";

import { ChangeBadge } from "@/components/domain/change-badge";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { FinancialChart } from "@/components/charts/financial-chart";
import { ChartContext } from "@/components/charts/chart-context";
import { ChartStylePicker, ChartToolButton, ChartToolGroup, ChartTools, type ChartStyle } from "@/components/charts/chart-tools";
import { CryptoBadgeIcon } from "@/components/domain/crypto-badge-icon";
import { TONE_STROKE } from "@/components/domain/svg-price-chart";
import { ErrorState } from "@/components/ui/error-state";
import { indexFromKey } from "@/components/ui/keys";
import { cn } from "@/lib/cn";
import { chartCapabilities, chartPoints, compatibleSpot, historyDescription, observedSeries, pricePrecision } from "@/lib/charts/data";
import { formatDateTime } from "@/lib/format";
import { SPOT_MS, useHistory, usePrices } from "@/lib/hooks/queries";
import { useChartFullscreen } from "@/lib/hooks/use-chart-fullscreen";
import { useT } from "@/lib/hooks/use-t";
import type { Quote, Range } from "@/lib/types";

type RangeOption = {
  value: Range;
  labelEs: string;
  labelEn: string;
  ariaEs: string;
  ariaEn: string;
};

const CRYPTO_RANGES: readonly RangeOption[] = [
  { value: "1D", labelEs: "1D", labelEn: "1D", ariaEs: "Ventana intradía", ariaEn: "Intraday window" },
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

function formatCryptoPrice(value: number, language: "es-CL" | "en"): string {
  if (!Number.isFinite(value)) return "—";
  const decimals = pricePrecision(value);
  return new Intl.NumberFormat(language, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
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

export function CryptoDetailChart({ symbol, name }: { symbol: string; name: string }) {
  const { language } = useT();
  const isEn = language === "en";
  const [range, setRange] = useState<Range>("1M");
  const [grid, setGrid] = useState(false);
  const [style, setStyle] = useState<ChartStyle>("area");
  const { ref: fullscreenRef, expanded, toggle: toggleFullscreen } = useChartFullscreen();
  const [axisMode, setAxisMode] = useState<"price" | "percent">("price");
  const [hover, setHover] = useState<{
    key: string;
    usd: number;
    timeMs: number | null;
  } | null>(null);

  const symbols = useMemo(() => [symbol], [symbol]);
  const pricesQuery = usePrices(symbols, true, SPOT_MS);
  const historyQuery = useHistory(symbol, range);

  const quote = useMemo(() => {
    const rows = pricesQuery.data;
    if (!rows) return null;
    const upper = symbol.toUpperCase();
    const match = rows.find((row) => row.symbol.toUpperCase() === upper);
    if (!match || !isUsableQuote(match)) return null;
    return match;
  }, [pricesQuery.data, symbol]);

  const rawPoints = historyQuery.data?.points;
  const validPoints = useMemo(() => chartPoints(rawPoints ?? []), [rawPoints]);

  const livePoint = useMemo(() => compatibleSpot(historyQuery.data?.source, quote), [historyQuery.data?.source, quote]);
  const observedPoints = useMemo(() => observedSeries(validPoints, livePoint), [validPoints, livePoint]);

  const seriesStats = useMemo(() => {
    if (validPoints.length < 2) return null;
    const allPrices = observedPoints.map((pt) => pt.p);
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
  }, [validPoints, observedPoints]);

  const seriesKey = `${symbol}:${range}:${historyQuery.data?.source ?? "unavailable"}`;

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
  const hasOhlc = chartCapabilities(observedPoints, historyQuery.data?.metadata).ohlc;
  const candlesAvailable = hasOhlc && axisMode === "price";
  const chartStyle = style === "candles" && !candlesAvailable ? "area" : style;

  const sourceBadgeLabel = useMemo(() => {
    if (!quote) return null;
    if (quote.source === "jupiter") return "Jupiter · Solana";
    return isEn ? "Demo quote" : "Precio demo";
  }, [quote, isEn]);

  return (
    <section
      aria-labelledby="precio-cripto-vivo"
      className="flex min-w-0 flex-col gap-4"
    >
      {/* Spot en vivo + cambio 24h + estado de frescura */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="precio-cripto-vivo"
              className="text-xs font-medium tracking-wider text-fg-muted uppercase"
            >
              {activeHover ? historyDescription(historyQuery.data?.source, isEn) : isEn ? "Token price" : "Precio del token"} · {symbol}
            </h2>
            {sourceBadgeLabel && !activeHover ? (
              <span className="inline-flex items-center rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-body">
                {sourceBadgeLabel}
              </span>
            ) : null}
            <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-medium text-fg-muted">
              USD
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            {pricesQuery.isPending && !quote ? (
              <div
                aria-hidden
                className="h-10 w-44 animate-pulse rounded-md bg-surface-2"
              />
            ) : displayedUsd !== null ? (
              <p className="num text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                {formatCryptoPrice(displayedUsd, language)}
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

          {activeHover?.timeMs ? (
            <p className="mt-1.5 text-xs font-medium text-fg-body">
              {formatDateTime(new Date(activeHover.timeMs).toISOString())}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          {!activeHover ? <PriceFreshness
            at={quote?.updatedAt ?? null}
            stale={quote?.stale}
            live={quote?.source === "jupiter" && !quote?.stale}
          /> : null}
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
      {pricesQuery.isError ? <p role="status" className="text-xs text-warn">{quote ? isEn ? "The quote could not be refreshed. Its last update is shown above." : "No pudimos actualizar la cotización. Su última actualización aparece arriba." : isEn ? "The current quote is unavailable; historical observations remain separate." : "La cotización actual no está disponible; los registros históricos se muestran por separado."} <button type="button" onClick={() => { void pricesQuery.refetch(); }} className="min-h-9 underline underline-offset-2">{isEn ? "Retry quote" : "Reintentar cotización"}</button></p> : null}

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
                  "min-h-11 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg sm:min-h-9",
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
            <span className="num">
              {isEn ? "Min" : "Mín"}{" "}
              <span className="text-fg-body">{formatCryptoPrice(seriesStats.minUsd, language)}</span>
              {" · "}{isEn ? "Max" : "Máx"}{" "}
              <span className="text-fg-body">{formatCryptoPrice(seriesStats.maxUsd, language)}</span>
            </span>
          </div>
        ) : null}
      </div>

      {/* Área de gráfico o tarjeta honesta de precio en vivo */}
      {historyQuery.isPending ? (
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
              ? quote ? "The current quote is available above." : "The quote is also unavailable. Try again in a moment."
              : quote ? "La cotización actual está disponible arriba." : "La cotización también está pendiente. Puedes volver a intentarlo."
          }
          onRetry={() => {
            void historyQuery.refetch();
          }}
          retryLabel={isEn ? "Retry history" : "Reintentar historial"}
        />
      ) : hasChartSeries ? (
        <div
          ref={fullscreenRef}
          role={expanded ? "dialog" : undefined}
          aria-modal={expanded || undefined}
          aria-label={expanded ? (isEn ? `Chart for ${name}` : `Gráfico de ${name}`) : undefined}
          className={cn("flex min-w-0 flex-col gap-3", expanded && "fixed inset-0 z-[100] h-[100dvh] overflow-y-auto bg-bg p-4 sm:p-8")}
        >
          <div className="flex items-center justify-between gap-3">
            {expanded ? (
              <div className="flex min-w-0 items-center gap-3">
                <CryptoBadgeIcon symbol={symbol} size={40} loading="eager" />
                <div className="min-w-0">
                  <p className="truncate text-lg font-medium">{name}</p>
                  <p className="num text-xs text-fg-muted">{symbol} · USD</p>
                </div>
              </div>
            ) : null}
            <div className="ml-auto">
              <ChartTools>
                <div className="grid gap-3">
                  <ChartStylePicker
                    value={chartStyle}
                    onChange={setStyle}
                    candlesAvailable={candlesAvailable}
                    candleHint={hasOhlc
                      ? (isEn ? "Switch the axis to USD to view candles." : "Cambia el eje a USD para ver velas.")
                      : (isEn ? "This range has no verified candle data." : "Este rango no tiene datos verificados para velas.")}
                  />
                  <ChartToolGroup label={isEn ? "Display" : "Visualización"}>
                    <div className="flex flex-wrap gap-1.5">
                      <ChartToolButton pressed={grid} onClick={() => setGrid((value) => !value)}>{isEn ? "Grid" : "Cuadrícula"}</ChartToolButton>
                      <ChartToolButton pressed={axisMode === "percent"} onClick={() => setAxisMode((value) => value === "price" ? "percent" : "price")}>{isEn ? "Axis" : "Eje"} · {axisMode === "percent" ? "%" : "USD"}</ChartToolButton>
                    </div>
                  </ChartToolGroup>
                </div>
              </ChartTools>
            </div>
          </div>
          <FinancialChart
            datasetKey={`${seriesKey}:${historyQuery.data?.metadata?.provider ?? "unknown"}:${historyQuery.data?.metadata?.resolution ?? "unknown"}`}
            currency="USD"
            metadata={historyQuery.data?.metadata}
            points={observedPoints}
            tone={tone}
            lineColor={TONE_STROKE[tone]}
            chartStyle={chartStyle}
            label={
              isEn
                ? `${name} (${symbol}) price chart — ${activeRangeLabel}`
                : `Gráfico de precio de ${name} (${symbol}) — ${activeRangeLabel}`
            }
            emptyLabel={
              isEn ? "No history available" : "Sin historial disponible"
            }
            onHover={handleHover}
            showGrid={grid}
            axisMode={axisMode}
            reference={historyQuery.data?.source !== "ticks"}
            heightClassName={expanded ? "h-[72dvh] shrink-0" : "h-64 sm:h-80"}
            onToggleFullscreen={toggleFullscreen}
            isFullscreen={expanded}
          />
          <ChartContext source={historyQuery.data?.source} points={observedPoints} currency="USD" range={range} metadata={historyQuery.data?.metadata} refreshing={historyQuery.isFetching} refreshFailed={historyQuery.isError} onRetry={() => { void historyQuery.refetch(); }} />
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
              ? quote ? "There are not enough observations for this range. The current quote is shown above." : "There are not enough observations for this range and the quote is unavailable."
              : quote ? `Faltan registros históricos de ${symbol} para ${activeRangeLabel}. La cotización actual aparece arriba.` : `Faltan registros históricos de ${symbol} para ${activeRangeLabel} y no hay cotización disponible.`}
          </p>
          <button type="button" onClick={() => { void historyQuery.refetch(); }} className="mt-2 min-h-11 text-xs underline underline-offset-2">{isEn ? "Retry history" : "Reintentar historial"}</button>
          <ChartContext source={historyQuery.data?.source} points={observedPoints} currency="USD" range={range} metadata={historyQuery.data?.metadata} />
          {quote ? (
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-fg-muted">{isEn ? "Spot price (USD)" : "Precio spot (USD)"}</dt>
                <dd className="num mt-0.5 font-medium text-fg">
                  {formatCryptoPrice(quote.priceUsd, language)}
                </dd>
              </div>
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

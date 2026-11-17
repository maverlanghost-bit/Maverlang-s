"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { PriceText } from "@/components/domain/price-text";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { SvgPriceChart, type ChartPoint } from "@/components/domain/svg-price-chart";
import { useLandingQuote } from "@/components/landing/live-landing-prices";
import { historyDescription, observedSeries } from "@/lib/charts/data";
import { cn } from "@/lib/cn";
import { formatMoney, formatPercent, formatShares } from "@/lib/format";
import { useHistory } from "@/lib/hooks/queries";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";
import type { LandingQuote } from "@/lib/mocks/landing";
import type { Range } from "@/lib/types";

/** Rangos del gráfico; la ficha compacta del hero (`hero-quote-card.tsx`) los reutiliza. */
export const RANGE_OPTIONS: { value: Range; label: string; name: string }[] = [
  { value: "1D", label: "1D", name: "1 día" },
  { value: "1W", label: "1S", name: "1 semana" },
  { value: "1M", label: "1M", name: "1 mes" },
  { value: "3M", label: "3M", name: "3 meses" },
  { value: "1Y", label: "1A", name: "1 año" },
];

/**
 * Ficha de una acción en la portada. Usa sólo lo que ya recibe: precio y
 * variación de la quote (en vivo cuando la fuente responde) y el historial
 * del período que entrega `useHistory`. Sin series inventadas: si no hay
 * puntos, el gráfico queda vacío y lo dice.
 */
export function LandingQuotePreview({ quote, live }: { quote: LandingQuote; live: boolean }) {
  const current = useLandingQuote(quote.symbol, {
    priceUsd: quote.priceUsd,
    change: quote.change,
  });
  const { priceUsd, change, stale, demo, reference, updatedAt } = current;

  const [range, setRange] = useState<Range>("1M");
  const history = useHistory(quote.symbol, range);
  const rangeName = RANGE_OPTIONS.find((option) => option.value === range)?.name ?? "";

  const chartData = useMemo<ChartPoint[]>(() => {
    const rows = observedSeries(history.data?.points ?? []);
    return rows.length >= 2 ? rows : [];
  }, [history.data]);

  const stats = useMemo<{
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
  }>(() => {
    if (chartData.length === 0) return { open: null, high: null, low: null, close: null };

    let high = Number.NEGATIVE_INFINITY;
    let low = Number.POSITIVE_INFINITY;
    for (const point of chartData) {
      if (point.p > high) high = point.p;
      if (point.p < low) low = point.p;
    }
    return {
      open: chartData[0]?.p ?? null,
      high,
      low,
      close: chartData[chartData.length - 1]?.p ?? null,
    };
  }, [chartData]);

  const periodChange =
    stats.open !== null && stats.close !== null && stats.open > 0
      ? (stats.close - stats.open) / stats.open
      : null;

  const priceValid = Number.isFinite(priceUsd) && priceUsd > 0;
  const fraction = priceValid ? formatShares(LANDING_MIN_ORDER_USD / priceUsd) : "—";
  const historyIsReference = history.data?.source !== "ticks" || history.data?.real !== true;
  const priceState = demo
    ? "Precio ilustrativo"
    : reference
      ? "Precio de referencia"
    : stale
      ? "Último precio conocido"
      : "Cotización del token";
  const firstObservation = chartData[0];
  const lastObservation = chartData[chartData.length - 1];
  const observationDate = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" });

  return (
    <div className="border-y border-border">
      <div className="grid gap-10 py-8 md:py-10 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-16">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
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
              <p title={quote.name} className="truncate text-base leading-snug font-medium text-fg">{quote.name}</p>
              <p className="mt-0.5 truncate text-sm leading-snug text-fg-muted">
                {quote.symbol} · {quote.underlying}
              </p>
            </div>
          </div>

          <div className="mt-8">
            <p className="text-sm leading-none text-fg-muted">Precio por acción</p>
            <PriceText
              value={priceUsd}
              currency="USD"
              size="lg"
              live={live && current.source === "jupiter" && !reference && !stale}
              className="mt-3 block whitespace-nowrap"
            />
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  "num text-sm font-medium",
                  change > 0 ? "text-up" : change < 0 ? "text-down" : "text-fg-muted",
                )}
              >
                <span className="sr-only">
                  {change > 0 ? "Sube " : change < 0 ? "Baja " : "Sin cambio "}
                </span>
                {formatPercent(change)}
              </span>
              <span className="text-sm text-fg-muted">24 h</span>
              <span aria-hidden className="text-sm text-fg-muted">
                ·
              </span>
              <span className="text-sm text-fg-muted">{priceState} · USD</span>
            </div>
            {!demo && !reference ? <PriceFreshness at={updatedAt} stale={stale} className="mt-2" /> : null}
          </div>

          <div className="mt-8 border-t border-border pt-4">
            <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-sm text-fg-muted">Con US${LANDING_MIN_ORDER_USD}</span>
              <span className="num text-sm text-fg">
                {fraction} {quote.symbol}
              </span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Cálculo referencial al precio mostrado.
            </p>
          </div>

          <Link
            href={quote.href}
            className="mt-6 inline-flex min-h-11 w-fit items-center text-sm font-medium text-fg"
          >
            <span className="border-b border-border-strong pb-0.5 transition-colors hover:border-fg">
              Ver ficha de {quote.symbol} →
            </span>
          </Link>
        </div>

        <div className="min-w-0 lg:border-l lg:border-border lg:pl-12 xl:pl-16">
          <div className="flex flex-col gap-2 border-b border-border pb-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4">
            <p className="text-sm text-fg-muted">
              {historyDescription(history.data?.source, false)} · {rangeName} · USD
            </p>
            <div role="group" aria-label="Rango del gráfico" className="-ml-2 flex items-center gap-0.5 sm:ml-0">
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
            <SvgPriceChart
              points={chartData}
              tone={periodChange === null ? "flat" : periodChange >= 0 ? "up" : "down"}
              label={`Historial de ${quote.name} en ${rangeName}`}
              emptyLabel="Sin historial disponible"
              emptyHint="La fuente no entregó puntos para este período."
              quiet={history.isPending}
              onHover={() => undefined}
              heightClassName="h-56 sm:h-64 lg:h-72"
              reference={historyIsReference}
              showExtremes={false}
            />
          </div>

          {stats.open !== null && stats.high !== null && stats.low !== null ? (
            <dl
              aria-label="Métricas del período"
              className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border pt-4 sm:grid-cols-3"
            >
              <div className="min-w-0">
                <dt className="text-sm leading-none text-fg-muted">Primer registro</dt>
                <dd className="num mt-1.5 text-sm text-fg">{formatMoney(stats.open, "USD")}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-sm leading-none text-fg-muted">Mayor registro</dt>
                <dd className="num mt-1.5 text-sm text-fg">{formatMoney(stats.high, "USD")}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-sm leading-none text-fg-muted">Menor registro</dt>
                <dd className="num mt-1.5 text-sm text-fg">{formatMoney(stats.low, "USD")}</dd>
              </div>
            </dl>
          ) : null}
          {firstObservation && lastObservation ? (
            <p className="mt-3 text-xs leading-relaxed text-fg-muted">
              Registros disponibles del <time dateTime={new Date(firstObservation.t).toISOString()}>{observationDate.format(firstObservation.t)}</time> al <time dateTime={new Date(lastObservation.t).toISOString()}>{observationDate.format(lastObservation.t)}</time>.
              {history.data?.source === "closes" ? " Referencia del subyacente; no son operaciones del token." : history.data?.source === "mock" ? " Precios simulados de demostración." : " Sondeos del precio del token."}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

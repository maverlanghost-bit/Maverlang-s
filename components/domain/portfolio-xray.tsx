"use client";

import Link from "next/link";

import { ChangeBadge } from "@/components/domain/change-badge";
import { Button } from "@/components/ui/button";
import { positionMeta } from "@/lib/catalog/position-meta";
import { cn } from "@/lib/cn";
import { formatClp, formatUsd } from "@/lib/format";
import { useHistory } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { rangeMove } from "@/lib/market/series";
import type { Currency, Position, Ticker } from "@/lib/types";

type AssetBucketKey = "stocks" | "etfs" | "crypto" | "cash";

interface AssetBucket {
  key: AssetBucketKey;
  label: string;
  valueUsd: number;
  pct: number;
  color: string;
}

const BUCKET_COLORS: Record<AssetBucketKey, string> = {
  stocks: "#0369a1",
  etfs: "#047857",
  crypto: "#6d28d9",
  cash: "#475569",
};

const MASK = "••••";

function formatPctLabel(ratio: number): string {
  const pct = ratio * 100;
  if (pct > 0 && pct < 0.1) return "<0,1%";
  return `${pct.toFixed(1).replace(".", ",")}%`;
}

function computePortfolioReturnPct(positions: readonly Position[]): number | null {
  let totalCostUsd = 0;
  let totalPnlUsd = 0;
  let weightedPctSum = 0;
  let weightedValueSum = 0;

  for (const pos of positions) {
    if (!Number.isFinite(pos.valueUsd) || pos.valueUsd <= 0) continue;
    if (pos.pnlUsd !== null && Number.isFinite(pos.pnlUsd)) {
      const cost = pos.valueUsd - pos.pnlUsd;
      if (cost > 0) {
        totalCostUsd += cost;
        totalPnlUsd += pos.pnlUsd;
      }
    }
    if (pos.pnlPct !== null && Number.isFinite(pos.pnlPct)) {
      weightedPctSum += pos.pnlPct * pos.valueUsd;
      weightedValueSum += pos.valueUsd;
    }
  }

  if (totalCostUsd > 0) return totalPnlUsd / totalCostUsd;
  if (weightedValueSum > 0) return weightedPctSum / weightedValueSum;
  return null;
}

/**
 * Rayos X de cartera: desglose por clase de activo (Acciones EE.UU., ETFs,
 * Cripto & Staking, Efectivo USDC), comparativa frente al S&P 500 (SPYx, 1M)
 * y accesos directos al asistente IA y al armador de Mix.
 */
export function PortfolioXray({
  positions,
  tickersBySymbol,
  cashUsdc,
  totalUsd,
  currency,
  rate,
  masked = false,
}: {
  positions: readonly Position[];
  tickersBySymbol: ReadonlyMap<string, Ticker>;
  cashUsdc: number;
  totalUsd: number;
  currency: Currency;
  rate: number | undefined;
  masked?: boolean;
}) {
  const { language } = useT();
  const spyxHistory = useHistory("SPYx", "1M");

  if (positions.length === 0) return null;

  const isEn = language === "en";
  const rateValue = typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
  const showInClp = currency === "CLP" && rateValue !== null;

  const formatMoneyUsd = (usd: number): string => {
    if (masked) return MASK;
    return showInClp && rateValue !== null ? formatClp(usd * rateValue) : formatUsd(usd);
  };

  let stocksUsd = 0;
  let etfsUsd = 0;
  let cryptoUsd = 0;

  for (const pos of positions) {
    const val = Number.isFinite(pos.valueUsd) && pos.valueUsd > 0 ? pos.valueUsd : 0;
    if (val === 0) continue;
    const meta = positionMeta(pos.symbol);
    if (meta?.kind === "crypto" || meta?.kind === "lst") {
      cryptoUsd += val;
    } else if (tickersBySymbol.get(pos.symbol)?.category === "etf") {
      etfsUsd += val;
    } else {
      stocksUsd += val;
    }
  }

  const safeCashUsd = Number.isFinite(cashUsdc) && cashUsdc > 0 ? cashUsdc : 0;
  const sumAll = stocksUsd + etfsUsd + cryptoUsd + safeCashUsd;
  const baseTotalUsd = totalUsd > 0 ? totalUsd : sumAll;
  if (baseTotalUsd <= 0) return null;

  const rawBuckets: { key: AssetBucketKey; label: string; valueUsd: number }[] = [
    { key: "stocks", label: isEn ? "US Stocks" : "Acciones EE.UU.", valueUsd: stocksUsd },
    { key: "etfs", label: "ETFs", valueUsd: etfsUsd },
    { key: "crypto", label: isEn ? "Crypto" : "Cripto", valueUsd: cryptoUsd },
    { key: "cash", label: isEn ? "USDC Cash" : "Efectivo USDC", valueUsd: safeCashUsd },
  ];

  const buckets: AssetBucket[] = rawBuckets
    .filter((b) => b.valueUsd > 0)
    .map((b) => ({
      ...b,
      pct: b.valueUsd / baseTotalUsd,
      color: BUCKET_COLORS[b.key],
    }));

  const spyxReturn1M = rangeMove(spyxHistory.data?.points ?? []);
  const portfolioReturnPct = computePortfolioReturnPct(positions);
  const activeAssetClasses = buckets.filter((b) => b.key !== "cash").length;

  const assistantQuery = isEn
    ? "Analyze my portfolio: asset-class breakdown, concentration, comparison vs S&P 500, and how to improve diversification"
    : "Analiza mi cartera: distribución por clase de activo, concentración, comparación frente al S&P 500 y cómo mejorar mi diversificación";

  return (
    <section aria-labelledby="portfolio-xray-heading" className="border-t border-border pt-8">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-prose">
          <p className="label">{isEn ? "Portfolio X-Ray" : "Rayos X de cartera"}</p>
          <h2 id="portfolio-xray-heading" className="mt-1.5 text-lg font-medium tracking-tight text-balance text-fg">
            {isEn ? "Asset-class breakdown & benchmark" : "Diagnóstico por clase de activo y comparativa"}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
            {isEn
              ? "How your capital is distributed across asset classes today, alongside the S&P 500 (SPYx) 1M reference."
              : "Cómo se distribuye tu capital hoy entre clases de activo, junto a la referencia de 1 mes del S&P 500 (SPYx)."}
          </p>
        </div>
      </div>

      {/* Distribución por clase de activo */}
      <div className="mt-6 flex flex-col gap-4">
        <div
          role="img"
          aria-label={
            isEn
              ? "Asset class distribution bar"
              : "Barra de distribución por clase de activo"
          }
          className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-3"
        >
          {buckets.map((bucket) => (
            <span
              key={bucket.key}
              aria-hidden="true"
              style={{
                width: `${Math.min(100, Math.max(0, bucket.pct * 100))}%`,
                backgroundColor: bucket.color,
              }}
              className="h-full transition-[width] duration-300"
            />
          ))}
        </div>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {buckets.map((bucket) => (
            <li
              key={bucket.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg px-3.5 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: bucket.color }}
                />
                <span className="truncate text-[13px] font-medium text-fg">{bucket.label}</span>
              </div>
              <div className="flex shrink-0 items-baseline gap-2.5">
                <span className="num text-[13px] text-fg-muted">{formatMoneyUsd(bucket.valueUsd)}</span>
                <span className="num min-w-[3.25rem] text-right text-[13px] font-medium text-fg">
                  {masked ? "••%" : formatPctLabel(bucket.pct)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Comparativa vs S&P 500 (SPYx) */}
      <div className="mt-6 rounded-lg border border-border bg-surface-1/50 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="label">{isEn ? "Your positions (total P&L)" : "Tus posiciones (retorno acumulado)"}</p>
            <div className="mt-1.5 flex items-center gap-2">
              {masked ? (
                <span className="num text-base font-medium text-fg">{MASK}</span>
              ) : portfolioReturnPct !== null ? (
                <ChangeBadge value={portfolioReturnPct} />
              ) : (
                <span className="text-[13px] text-fg-muted">{isEn ? "Unavailable" : "Sin datos"}</span>
              )}
            </div>
          </div>

          <div className={cn("min-w-0", "sm:border-l sm:border-border sm:pl-4")}>
            <p className="label">{isEn ? "S&P 500 (SPYx) · 1M" : "S&P 500 (SPYx) · último mes"}</p>
            <div className="mt-1.5 flex items-center gap-2">
              {spyxHistory.isPending ? (
                <span className="text-[13px] text-fg-muted">{isEn ? "Loading…" : "Cargando…"}</span>
              ) : spyxReturn1M !== null ? (
                <ChangeBadge value={spyxReturn1M} />
              ) : (
                <span className="text-[13px] text-fg-muted">{isEn ? "Unavailable" : "No disponible"}</span>
              )}
            </div>
          </div>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-fg-muted">
          {activeAssetClasses <= 1
            ? isEn
              ? "Your invested capital is concentrated in a single asset class. Combining broad ETFs (like SPYx), individual stocks, and USDC liquidity can help balance volatility."
              : "Tu capital invertido está concentrado en una sola clase de activo. Combinar ETFs amplios (como SPYx), acciones individuales y liquidez en USDC ayuda a equilibrar la volatilidad."
            : isEn
              ? `You hold ${activeAssetClasses} distinct asset classes. Comparing against the S&P 500 (SPYx) helps gauge whether your diversification is tracking or buffering broad market moves.`
              : `Tienes ${activeAssetClasses} clases de activo distintas. Comparar contra el S&P 500 (SPYx) te ayuda a evaluar si tu diversificación acompaña o amortigua el mercado amplio.`}
        </p>
      </div>

      {/* Acciones recomendadas */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <Button asChild size="sm">
          <Link href={`/app/asistente?q=${encodeURIComponent(assistantQuery)}`}>
            {isEn ? "Analyze my portfolio with Maverlang AI" : "Analizar mi cartera con Maverlang IA"}
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href="/app/mix">{isEn ? "Build a new Mix" : "Armar nuevo Mix"}</Link>
        </Button>
      </div>
    </section>
  );
}

"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { searchMarket, type MarketSearchItem } from "@/lib/api/client";
import { CRYPTO_ASSETS, type CryptoAsset } from "@/lib/catalog/crypto";
import { formatMoney, formatPercent } from "@/lib/format";
import { useFx, useHistory, usePrices } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice, fold } from "@/lib/market/browse";
import { anchorSeriesToSpot } from "@/lib/market/series";
import type { Currency, PricePoint, Quote, Range } from "@/lib/types";

const DEFAULT_SYMBOLS = ["NVDAx", "MSFTx", "SPYx", "BTC"] as const;
const COLORS = ["#047857", "#2563eb", "#7c3aed", "#d97706"] as const;
const RANGES: readonly { value: Range; label: string }[] = [
  { value: "1D", label: "1D" },
  { value: "1W", label: "1S" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "1Y", label: "1A" },
];

const QUICK_COMBOS: readonly { label: string; en: string; symbols: readonly string[] }[] = [
  { label: "7 Magníficos Top 4", en: "Magnificent 7 Top 4", symbols: ["NVDAx", "AAPLx", "MSFTx", "AMZNx"] },
  { label: "IA vs S&P 500", en: "AI vs S&P 500", symbols: ["NVDAx", "MSFTx", "GOOGLx", "SPYx"] },
  { label: "Tech vs Cripto", en: "Tech vs Crypto", symbols: ["NVDAx", "TSLAx", "BTC", "SOL"] },
];

type NormalizedAsset = {
  symbol: string;
  name: string;
  kind: "stock" | "crypto";
  issuerOrNetwork: string;
  logoUrl: string | null;
  tradeHref: string;
};

type SeriesPoint = { t: number; pct: number };

const CRYPTO_BY_SYMBOL = new Map<string, CryptoAsset>(
  CRYPTO_ASSETS.filter((c) => c.decimals !== null).map((c) => [c.symbol.toLowerCase(), c]),
);

function buildInitialSymbols(raw?: readonly string[]): string[] {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const s of raw ?? []) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
    if (cleaned.length >= 4) break;
  }
  if (cleaned.length === 0) return [...DEFAULT_SYMBOLS];
  if (cleaned.length === 1) {
    const fallback = cleaned[0]?.toLowerCase() === "spyx" ? "NVDAx" : "SPYx";
    return [cleaned[0]!, fallback];
  }
  return cleaned;
}

function resolveAssetMeta(
  symbol: string,
  stockMap: ReadonlyMap<string, MarketSearchItem>,
): NormalizedAsset {
  const stock = stockMap.get(symbol.toLowerCase());
  if (stock) {
    return {
      symbol: stock.symbol,
      name: stock.name,
      kind: "stock",
      issuerOrNetwork: stock.symbol.endsWith("on") ? "Ondo · Solana" : "Backed (xStocks) · Solana",
      logoUrl: stock.logoUrl,
      tradeHref: `/app/accion/${encodeURIComponent(stock.symbol)}?operar=comprar`,
    };
  }
  const crypto = CRYPTO_BY_SYMBOL.get(symbol.toLowerCase());
  if (crypto) {
    return {
      symbol: crypto.symbol,
      name: crypto.name,
      kind: "crypto",
      issuerOrNetwork: `${crypto.originLabel} · Solana`,
      logoUrl: null,
      tradeHref: `/app/cripto/${encodeURIComponent(crypto.symbol)}`,
    };
  }
  const isOndo = symbol.endsWith("on");
  return {
    symbol,
    name: symbol,
    kind: "stock",
    issuerOrNetwork: isOndo ? "Ondo · Solana" : "Solana",
    logoUrl: null,
    tradeHref: `/app/accion/${encodeURIComponent(symbol)}?operar=comprar`,
  };
}

function normalizePoints(points: readonly PricePoint[], spot?: number): SeriesPoint[] {
  if (points.length < 2) return [];
  const anchored = spot !== undefined && spot > 0 ? anchorSeriesToSpot(points, spot) : points;
  const base = anchored[0]?.p;
  if (!base || !Number.isFinite(base) || base <= 0) return [];
  return anchored
    .filter((pt) => Number.isFinite(pt.t) && Number.isFinite(pt.p))
    .map((pt) => ({ t: pt.t, pct: pt.p / base - 1 }));
}

function nearestPoint(series: readonly SeriesPoint[], targetT: number): SeriesPoint | null {
  if (series.length === 0) return null;
  let lo = 0;
  let hi = series.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((series[mid]?.t ?? 0) < targetT) lo = mid + 1;
    else hi = mid;
  }
  const curr = series[lo]!;
  if (lo === 0) return curr;
  const prev = series[lo - 1]!;
  return Math.abs(curr.t - targetT) < Math.abs(prev.t - targetT) ? curr : prev;
}

function formatAxisDate(ms: number, range: Range): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  if (range === "1D") {
    return new Intl.DateTimeFormat("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Santiago",
    }).format(d);
  }
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    timeZone: "America/Santiago",
  }).format(d);
}

export function CompareProScreen({
  initialSymbols,
  sections,
}: {
  initialSymbols?: readonly string[];
  sections?: ReactNode;
}) {
  const { language, currency } = useT();
  const isEn = language === "en";

  const [symbols, setSymbols] = useState<string[]>(() => buildInitialSymbols(initialSymbols));
  const [range, setRange] = useState<Range>("1M");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [hiddenSymbols, setHiddenSymbols] = useState<ReadonlySet<string>>(() => new Set());
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [simInput, setSimInput] = useState<string>(() => (currency === "CLP" ? "1000000" : "1000"));
  const svgRef = useRef<SVGSVGElement | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["compare-catalog"],
    queryFn: () => searchMarket({ q: "", page: 1, pageSize: 50, sort: "liquidity", scope: "listed" }),
    staleTime: 60_000,
  });

  const stockMap = useMemo(() => {
    const map = new Map<string, MarketSearchItem>();
    for (const item of catalogQuery.data?.items ?? []) {
      map.set(item.symbol.toLowerCase(), item);
    }
    return map;
  }, [catalogQuery.data]);

  const pricesQuery = usePrices(symbols, symbols.length > 0);
  const fx = useFx();

  // Siempre 4 hooks fijos para cumplir Rules of Hooks.
  const h0 = useHistory(symbols[0] ?? "", range);
  const h1 = useHistory(symbols[1] ?? "", range);
  const h2 = useHistory(symbols[2] ?? "", range);
  const h3 = useHistory(symbols[3] ?? "", range);

  const historyQueries = useMemo(() => [h0, h1, h2, h3], [h0, h1, h2, h3]);

  const quotesBySymbol = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const q of pricesQuery.data ?? []) {
      map.set(q.symbol.toLowerCase(), q);
    }
    return map;
  }, [pricesQuery.data]);

  const assets = useMemo(
    () =>
      symbols.map((sym, idx) => ({
        meta: resolveAssetMeta(sym, stockMap),
        color: COLORS[idx % COLORS.length]!,
        quote: quotesBySymbol.get(sym.toLowerCase()) ?? null,
        history: historyQueries[idx],
      })),
    [symbols, stockMap, quotesBySymbol, historyQueries],
  );

  const normalizedSeries = useMemo(() => {
    return assets.map((entry) => {
      const pts = entry.history?.data?.points ?? [];
      const series = normalizePoints(pts, entry.quote?.priceUsd);
      const lastPct = series.length > 0 ? series[series.length - 1]!.pct : null;
      return {
        symbol: entry.meta.symbol,
        color: entry.color,
        series,
        periodReturn: lastPct,
        isPending: entry.history?.isPending ?? false,
      };
    });
  }, [assets]);

  const visibleSeries = useMemo(
    () => normalizedSeries.filter((s) => !hiddenSymbols.has(s.symbol) && s.series.length >= 2),
    [normalizedSeries, hiddenSymbols],
  );

  const chartBounds = useMemo(() => {
    let minT = Infinity;
    let maxT = -Infinity;
    let minPct = 0;
    let maxPct = 0;
    for (const s of visibleSeries) {
      for (const pt of s.series) {
        if (pt.t < minT) minT = pt.t;
        if (pt.t > maxT) maxT = pt.t;
        if (pt.pct < minPct) minPct = pt.pct;
        if (pt.pct > maxPct) maxPct = pt.pct;
      }
    }
    if (!Number.isFinite(minT) || !Number.isFinite(maxT) || minT >= maxT) {
      return null;
    }
    const spanPct = maxPct - minPct || 0.02;
    const padPct = spanPct * 0.12;
    return {
      minT,
      maxT,
      minPct: minPct - padPct,
      maxPct: maxPct + padPct,
    };
  }, [visibleSeries]);

  const searchResults = useMemo(() => {
    const needle = fold(search.trim());
    const selectedSet = new Set(symbols.map((s) => s.toLowerCase()));
    const pool: NormalizedAsset[] = [];

    for (const item of catalogQuery.data?.items ?? []) {
      if (selectedSet.has(item.symbol.toLowerCase())) continue;
      pool.push(resolveAssetMeta(item.symbol, stockMap));
    }
    for (const crypto of CRYPTO_ASSETS) {
      if (crypto.decimals === null) continue;
      if (selectedSet.has(crypto.symbol.toLowerCase())) continue;
      pool.push({
        symbol: crypto.symbol,
        name: crypto.name,
        kind: "crypto",
        issuerOrNetwork: `${crypto.originLabel} · Solana`,
        logoUrl: null,
        tradeHref: `/app/cripto/${encodeURIComponent(crypto.symbol)}`,
      });
    }

    if (!needle) return pool.slice(0, 8);
    return pool
      .filter((a) => fold(a.symbol).includes(needle) || fold(a.name).includes(needle))
      .slice(0, 8);
  }, [search, symbols, catalogQuery.data, stockMap]);

  function addSymbol(sym: string) {
    if (symbols.length >= 4) return;
    if (symbols.some((s) => s.toLowerCase() === sym.toLowerCase())) return;
    setSymbols((prev) => [...prev, sym]);
    setSearch("");
    setSearchOpen(false);
  }

  function removeSymbol(sym: string) {
    if (symbols.length <= 2) return;
    setSymbols((prev) => prev.filter((s) => s.toLowerCase() !== sym.toLowerCase()));
  }

  function toggleVisibility(sym: string) {
    setHiddenSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  }

  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const shownCurrency: Currency = currency === "CLP" && fxKnown ? "CLP" : "USD";
  const presets = shownCurrency === "CLP" ? [100_000, 500_000, 1_000_000, 5_000_000] : [100, 500, 1_000, 5_000];
  const simAmount = Math.max(0, Number(simInput.replace(/[^\d.]/g, "")) || 0);

  const SVG_W = 760;
  const SVG_H = 300;
  const PAD_L = 52;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 28;
  const PLOT_W = SVG_W - PAD_L - PAD_R;
  const PLOT_H = SVG_H - PAD_T - PAD_B;

  function xFor(t: number): number {
    if (!chartBounds) return PAD_L;
    return PAD_L + ((t - chartBounds.minT) / (chartBounds.maxT - chartBounds.minT)) * PLOT_W;
  }

  function yFor(pct: number): number {
    if (!chartBounds) return PAD_T + PLOT_H / 2;
    return PAD_T + PLOT_H - ((pct - chartBounds.minPct) / (chartBounds.maxPct - chartBounds.minPct)) * PLOT_H;
  }

  function handlePointerMove(clientX: number) {
    if (!svgRef.current || !chartBounds) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const relX = ((clientX - rect.left) / rect.width) * SVG_W;
    const ratio = Math.min(1, Math.max(0, (relX - PAD_L) / PLOT_W));
    setHoverT(chartBounds.minT + ratio * (chartBounds.maxT - chartBounds.minT));
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 lg:gap-8">
      {sections ? <div className="-mx-5 min-w-0 px-5 sm:mx-0 sm:px-0">{sections}</div> : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-fg sm:text-[28px]">
            {isEn ? "Multi-Asset Compare" : "Comparador Multi-Activo"}
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            {isEn
              ? "Compare 2 to 4 stocks, ETFs, or cryptocurrencies normalized by % return."
              : "Compara de 2 a 4 acciones, ETFs o criptomonedas normalizadas en % de rendimiento."}
          </p>
        </div>

        {/* Selector de rango */}
        <div
          role="group"
          aria-label={isEn ? "Time range" : "Rango temporal"}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-1 p-1"
        >
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              aria-pressed={range === r.value}
              className={cn(
                "min-h-9 min-w-10 cursor-pointer rounded-full px-3 text-xs font-medium transition-colors",
                range === r.value ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {/* Combinaciones rápidas y buscador */}
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-1/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-fg-muted">{isEn ? "Presets:" : "Combinaciones:"}</span>
          {QUICK_COMBOS.map((combo) => (
            <button
              key={combo.label}
              type="button"
              onClick={() => {
                setSymbols([...combo.symbols]);
                setHiddenSymbols(new Set());
              }}
              className="min-h-9 cursor-pointer rounded-full border border-border bg-bg px-3 text-xs font-medium text-fg transition-colors hover:bg-surface-2"
            >
              {isEn ? combo.en : combo.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {assets.map((entry) => {
            const canRemove = symbols.length > 2;
            return (
              <div
                key={entry.meta.symbol}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-bg pr-2 pl-3 text-sm"
              >
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="font-mono text-xs font-semibold text-fg">{entry.meta.symbol}</span>
                <span className="hidden max-w-[120px] truncate text-xs text-fg-muted sm:inline">
                  {entry.meta.name}
                </span>
                {canRemove ? (
                  <button
                    type="button"
                    onClick={() => removeSymbol(entry.meta.symbol)}
                    aria-label={`${isEn ? "Remove" : "Quitar"} ${entry.meta.symbol}`}
                    className="ml-0.5 inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            );
          })}

          {symbols.length < 4 ? (
            <div className="relative min-w-[210px] flex-1 sm:max-w-xs">
              <input
                type="search"
                value={search}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 180)}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSearchOpen(true);
                }}
                placeholder={isEn ? "+ Add stock, ETF or crypto…" : "+ Añadir acción, ETF o cripto…"}
                className="min-h-10 w-full rounded-full border border-border bg-bg px-3.5 text-xs text-fg placeholder:text-fg-muted focus:border-fg focus:outline-none"
              />
              {searchOpen && searchResults.length > 0 ? (
                <ul className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-bg p-1 shadow-lg">
                  {searchResults.map((candidate) => (
                    <li key={candidate.symbol}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addSymbol(candidate.symbol)}
                        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-surface-1"
                      >
                        <span className="min-w-0">
                          <span className="font-mono font-semibold text-fg">{candidate.symbol}</span>
                          <span className="ml-2 truncate text-fg-muted">{candidate.name}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-fg-muted">
                          {candidate.kind === "crypto" ? "Cripto" : "Acción/ETF"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* Gráfico comparativo normalizado */}
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-bg p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {normalizedSeries.map((entry) => {
              const hidden = hiddenSymbols.has(entry.symbol);
              const hoveredPt = hoverT !== null ? nearestPoint(entry.series, hoverT) : null;
              const shownPct = hoveredPt ? hoveredPt.pct : entry.periodReturn;
              return (
                <button
                  key={entry.symbol}
                  type="button"
                  onClick={() => toggleVisibility(entry.symbol)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs transition-opacity",
                    hidden ? "opacity-45" : "opacity-100",
                  )}
                >
                  <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="font-mono font-semibold text-fg">{entry.symbol}</span>
                  <span
                    className={cn(
                      "num font-medium tabular-nums",
                      shownPct === null
                        ? "text-fg-muted"
                        : shownPct >= 0
                          ? "text-up"
                          : "text-down",
                    )}
                  >
                    {shownPct !== null ? formatPercent(shownPct) : "—"}
                  </span>
                </button>
              );
            })}
          </div>

          {hoverT !== null ? (
            <span className="text-xs font-medium text-fg-muted">{formatAxisDate(hoverT, range)}</span>
          ) : null}
        </div>

        {normalizedSeries.some((s) => s.isPending) && visibleSeries.length === 0 ? (
          <Skeleton className="h-[260px] w-full rounded-xl" />
        ) : !chartBounds ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-fg-muted">
            {isEn ? "No historical data available for this range." : "Sin datos históricos suficientes para este rango."}
          </div>
        ) : (
          <div className="relative w-full overflow-hidden">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="h-auto w-full touch-pan-y select-none"
              onMouseMove={(e) => handlePointerMove(e.clientX)}
              onMouseLeave={() => setHoverT(null)}
              onTouchMove={(e) => {
                const touch = e.touches[0];
                if (touch) handlePointerMove(touch.clientX);
              }}
              onTouchEnd={() => setHoverT(null)}
            >
              {/* Línea base 0% */}
              {(() => {
                const y0 = yFor(0);
                return (
                  <g>
                    <line
                      x1={PAD_L}
                      x2={SVG_W - PAD_R}
                      y1={y0}
                      y2={y0}
                      stroke="currentColor"
                      strokeOpacity={0.22}
                      strokeDasharray="4 4"
                    />
                    <text x={PAD_L - 8} y={y0 + 4} textAnchor="end" fontSize="11" fill="currentColor" opacity={0.6}>
                      0%
                    </text>
                  </g>
                );
              })()}

              {/* Etiquetas min/max */}
              <text
                x={PAD_L - 8}
                y={PAD_T + 10}
                textAnchor="end"
                fontSize="11"
                fill="currentColor"
                opacity={0.55}
              >
                {formatPercent(chartBounds.maxPct)}
              </text>
              <text
                x={PAD_L - 8}
                y={SVG_H - PAD_B}
                textAnchor="end"
                fontSize="11"
                fill="currentColor"
                opacity={0.55}
              >
                {formatPercent(chartBounds.minPct)}
              </text>

              {/* Fechas eje X */}
              <text x={PAD_L} y={SVG_H - 6} textAnchor="start" fontSize="11" fill="currentColor" opacity={0.55}>
                {formatAxisDate(chartBounds.minT, range)}
              </text>
              <text
                x={SVG_W - PAD_R}
                y={SVG_H - 6}
                textAnchor="end"
                fontSize="11"
                fill="currentColor"
                opacity={0.55}
              >
                {formatAxisDate(chartBounds.maxT, range)}
              </text>

              {/* Curvas */}
              {visibleSeries.map((s) => {
                const d = s.series
                  .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${xFor(pt.t).toFixed(1)} ${yFor(pt.pct).toFixed(1)}`)
                  .join(" ");
                return (
                  <path
                    key={s.symbol}
                    d={d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}

              {/* Crosshair */}
              {hoverT !== null ? (
                <g>
                  <line
                    x1={xFor(hoverT)}
                    x2={xFor(hoverT)}
                    y1={PAD_T}
                    y2={SVG_H - PAD_B}
                    stroke="currentColor"
                    strokeOpacity={0.3}
                    strokeWidth={1}
                  />
                  {visibleSeries.map((s) => {
                    const pt = nearestPoint(s.series, hoverT);
                    if (!pt) return null;
                    return (
                      <circle
                        key={s.symbol}
                        cx={xFor(pt.t)}
                        cy={yFor(pt.pct)}
                        r={4.5}
                        fill={s.color}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                      />
                    );
                  })}
                </g>
              ) : null}
            </svg>
          </div>
        )}
      </section>

      {/* Simulador: ¿Cuánto valdrían hoy? */}
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-1/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-fg">
              {isEn ? "What would it be worth today?" : "¿Cuánto valdrían hoy?"}
            </h2>
            <p className="text-xs text-fg-muted">
              {isEn
                ? `Simulated investment at the start of the ${range} period.`
                : `Simulación invirtiendo al inicio del período (${range}).`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setSimInput(String(p))}
                className={cn(
                  "min-h-9 cursor-pointer rounded-full border px-3 text-xs font-medium tabular-nums transition-colors",
                  simAmount === p
                    ? "border-fg bg-fg text-bg"
                    : "border-border bg-bg text-fg-muted hover:text-fg",
                )}
              >
                {formatMoney(p, shownCurrency)}
              </button>
            ))}
            <input
              type="text"
              inputMode="decimal"
              aria-label={isEn ? "Investment amount" : "Monto a simular"}
              value={simInput}
              onChange={(e) => setSimInput(e.target.value)}
              className="num min-h-9 w-28 rounded-full border border-border bg-bg px-3 text-right text-xs font-medium text-fg focus:border-fg focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {assets.map((entry, idx) => {
            const ret = normalizedSeries[idx]?.periodReturn ?? null;
            const finalVal = ret !== null ? simAmount * (1 + ret) : null;
            const diff = finalVal !== null ? finalVal - simAmount : null;
            return (
              <div key={entry.meta.symbol} className="flex flex-col gap-1 rounded-xl border border-border bg-bg p-3.5">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="font-mono text-xs font-semibold text-fg">{entry.meta.symbol}</span>
                </div>
                <div className="num mt-1 text-lg font-semibold text-fg tabular-nums">
                  {finalVal !== null ? formatMoney(finalVal, shownCurrency) : "—"}
                </div>
                <div className="num text-xs tabular-nums">
                  {diff !== null && ret !== null ? (
                    <span className={diff >= 0 ? "text-up" : "text-down"}>
                      {diff >= 0 ? "+" : ""}
                      {formatMoney(diff, shownCurrency)} ({formatPercent(ret)})
                    </span>
                  ) : (
                    <span className="text-fg-muted">{isEn ? "No data" : "Sin datos"}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tabla lado a lado */}
      <section className="overflow-x-auto rounded-2xl border border-border bg-bg">
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border text-[12px] font-medium text-fg-muted">
              <th className="py-3 pr-3 pl-4">{isEn ? "Asset" : "Activo"}</th>
              <th className="px-3 py-3 text-right">{isEn ? "Live price" : "Precio vivo"}</th>
              <th className="px-3 py-3 text-right">{isEn ? `Return (${range})` : `Retorno (${range})`}</th>
              <th className="px-3 py-3 text-right">{isEn ? "24h change" : "Cambio 24h"}</th>
              <th className="px-3 py-3">{isEn ? "Issuer / Network" : "Emisor / Red"}</th>
              <th className="py-3 pr-4 pl-3 text-right">{isEn ? "Trade" : "Operar"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {assets.map((entry, idx) => {
              const price = entry.quote
                ? displayPrice(entry.quote.priceUsd, shownCurrency, fxKnown ? rate : undefined)
                : null;
              const change24h =
                entry.quote && Number.isFinite(entry.quote.change24hPct) ? entry.quote.change24hPct : null;
              const periodRet = normalizedSeries[idx]?.periodReturn ?? null;

              return (
                <tr key={entry.meta.symbol} className="transition-colors hover:bg-surface-1/60">
                  <td className="py-3 pr-3 pl-4">
                    <div className="flex items-center gap-3">
                      <TickerLogo
                        symbol={entry.meta.symbol}
                        name={entry.meta.name}
                        logoUrl={entry.meta.logoUrl}
                        size={32}
                        decorative
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
                          <span className="font-mono text-sm font-semibold text-fg">{entry.meta.symbol}</span>
                        </div>
                        <span className="block text-xs text-fg-muted">{entry.meta.name}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {price !== null ? (
                      <FlashPrice value={price} currency={shownCurrency} size="sm" className="font-medium" />
                    ) : pricesQuery.isPending ? (
                      <Skeleton className="ml-auto h-5 w-16" />
                    ) : (
                      <span className="text-xs text-fg-muted">—</span>
                    )}
                  </td>
                  <td className="num px-3 py-3 text-right text-sm font-medium tabular-nums">
                    {periodRet !== null ? (
                      <span className={periodRet >= 0 ? "text-up" : "text-down"}>{formatPercent(periodRet)}</span>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {change24h !== null ? (
                      <ChangeBadge value={change24h} size="sm" />
                    ) : (
                      <span className="text-xs text-fg-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-fg-muted">{entry.meta.issuerOrNetwork}</td>
                  <td className="py-3 pr-4 pl-3 text-right">
                    <Link
                      href={entry.meta.tradeHref}
                      className="inline-flex min-h-9 items-center rounded-lg bg-fg px-3 text-xs font-medium text-bg transition-opacity hover:opacity-90"
                    >
                      {isEn ? "Buy" : "Comprar"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

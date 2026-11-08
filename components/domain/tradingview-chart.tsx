"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import type { Range } from "@/lib/types";

export interface TradingViewChartProps {
  symbol: string;
  underlying?: string;
  range: Range;
  heightClassName?: string;
  fullscreen?: boolean;
}

type TvStyle = "1" | "3";

/** Intervalo del widget oficial por rango de la app. */
const TV_INTERVAL: Record<Range, string> = {
  "1D": "5",
  "1W": "30",
  "1M": "60",
  "3M": "D",
  "1Y": "D",
  ALL: "W",
};

/** Etiqueta legible del intervalo activo. */
const INTERVAL_LABEL: Record<Range, string> = {
  "1D": "5 min",
  "1W": "30 min",
  "1M": "1 hora",
  "3M": "1 día",
  "1Y": "1 día",
  ALL: "1 semana",
};

/** Bolsas de los ETF y de la acción con clase dual: TradingView exige el prefijo. */
const TV_SYMBOL_OVERRIDES: Record<string, string> = {
  SPY: "AMEX:SPY",
  QQQ: "NASDAQ:QQQ",
  GLD: "AMEX:GLD",
  TLT: "NASDAQ:TLT",
  "BRK.B": "NYSE:BRK.B",
  "BRK-B": "NYSE:BRK.B",
};

const WIDGET_BASE = "https://s.tradingview.com/widgetembed/";

/**
 * Quita el sufijo tokenizado (`NVDAx` → `NVDA`) y normaliza a mayúsculas.
 * `BRK.Bx` queda como `BRK.B`; el punto se conserva para el mapeo a `NYSE:BRK.B`.
 */
function cleanToken(value: string): string {
  const upper = value.trim().toUpperCase();
  if (upper.length > 1 && upper.endsWith("X")) return upper.slice(0, -1);
  if (upper.length > 2 && upper.endsWith("ON")) return upper.slice(0, -2);
  return upper;
}

/** Símbolo para TradingView: usa el subyacente si viene; si no, limpia el token. */
export function resolveTvSymbol(symbol: string, underlying?: string): string {
  const source = underlying?.trim() ? underlying : symbol;
  const token = cleanToken(source);
  return TV_SYMBOL_OVERRIDES[token] ?? token;
}

/** `1D` → 5 min, `1W` → 30 min, `1M` → 1 h, `3M`/`1Y` → diario, `ALL` → semanal. */
export function resolveTvInterval(range: Range): string {
  return TV_INTERVAL[range];
}

function buildWidgetUrl(tvSymbol: string, tvInterval: string, tvStyle: TvStyle): string {
  const params = new URLSearchParams();
  params.set("symbol", tvSymbol);
  params.set("interval", tvInterval);
  params.set("hidesidetoolbar", "0");
  params.set("symboledit", "0");
  params.set("saveimage", "0");
  params.set("toolbargb", "f8fafc");
  params.set("studies", "[]");
  params.set("theme", "light");
  params.set("style", tvStyle);
  params.set("timezone", "America/Santiago");
  params.set("withdateranges", "1");
  params.set("hide_volume", "0");
  params.set("locale", "es");
  return `${WIDGET_BASE}?${params.toString()}`;
}

/**
 * Gráfico de TradingView embebido (widget oficial por iframe). El estilo
 * alterna entre velas y área sin recargar la página: el iframe se re-monta
 * con una `key` distinta.
 */
export function TradingViewChart({
  symbol,
  underlying,
  range,
  heightClassName,
  fullscreen = false,
}: TradingViewChartProps) {
  const [tvStyle, setTvStyle] = useState<TvStyle>("1");

  const tvSymbol = resolveTvSymbol(symbol, underlying);
  const tvInterval = resolveTvInterval(range);
  const iframeUrl = buildWidgetUrl(tvSymbol, tvInterval, tvStyle);

  const containerHeight =
    heightClassName ??
    (fullscreen ? "h-[64vh] min-h-[420px]" : "h-80 sm:h-[400px] md:h-[440px]");

  return (
    <figure className="overflow-hidden rounded-2xl border border-border bg-bg">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-surface-1 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="size-1.5 shrink-0 rounded-full bg-up motion-safe:animate-pulse motion-reduce:animate-none"
            aria-hidden
          />
          <span className="truncate text-xs text-fg-muted">
            TradingView Live · Velas e indicadores en tiempo real
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-surface-3 px-2 py-0.5 font-mono text-[11px] tracking-[0.04em] text-fg-body">
            {INTERVAL_LABEL[range]}
          </span>
          <button
            type="button"
            onClick={() => setTvStyle((current) => (current === "1" ? "3" : "1"))}
            aria-pressed={tvStyle === "3"}
            className="rounded-full border border-border bg-bg px-2.5 py-1 text-[11px] font-medium text-fg-body transition duration-[140ms] ease-spring hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:outline-none active:scale-[0.98]"
          >
            Cambiar entre Velas / Área
          </button>
        </div>
      </div>
      <div className={cn("relative w-full bg-surface-1", containerHeight)}>
        <iframe key={`${tvSymbol}-${tvInterval}-${tvStyle}`} src={iframeUrl} title={`Gráfico TradingView de ${tvSymbol}`} className="h-full w-full border-0" loading="lazy" allowFullScreen />
      </div>
    </figure>
  );
}

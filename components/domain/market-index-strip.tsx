"use client";

import Link from "next/link";

import { ChangeBadge } from "@/components/domain/change-badge";
import { formatMoney } from "@/lib/format";
import { displayPrice } from "@/lib/market/browse";
import type { Currency, Quote } from "@/lib/types";

/**
 * Termómetros del mercado (T50). Tira horizontal con los benchmarks que sí
 * llegaron en la última consulta de precios. Nunca inventa cifras: si
 * `displayPrice` no puede resolver el monto, la fila muestra sólo símbolo y
 * variación.
 */
const BENCHMARKS = [
  { symbol: "SPYx", tag: "S&P 500" },
  { symbol: "QQQx", tag: "Nasdaq 100" },
  { symbol: "NVDAx", tag: "NVIDIA" },
  { symbol: "AAPLx", tag: "Apple" },
  { symbol: "TSLAx", tag: "Tesla" },
] as const;

type Benchmark = (typeof BENCHMARKS)[number];

interface BenchmarkQuote {
  symbol: Benchmark["symbol"];
  tag: Benchmark["tag"];
  quote: Quote;
}

function isUsableRate(rate: number | undefined): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
}

export function MarketIndexStrip({
  quotes,
  currency,
  rate,
}: {
  quotes: ReadonlyMap<string, Quote>;
  currency: Currency;
  rate: number | undefined;
}) {
  const available: BenchmarkQuote[] = [];
  for (const benchmark of BENCHMARKS) {
    const quote = quotes.get(benchmark.symbol);
    if (quote !== undefined) available.push({ symbol: benchmark.symbol, tag: benchmark.tag, quote });
  }

  if (available.length === 0 && !isUsableRate(rate)) return null;

  return (
    <section
      aria-label="Termómetros del mercado"
      className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-border/70 bg-white/85 px-3.5 py-2.5 shadow-xs backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-fg uppercase">
        <span className="size-1.5 rounded-full bg-up" aria-hidden="true" />
        Pulso 24/7
      </span>

      {available.map(({ symbol, tag, quote }) => {
        const price = displayPrice(quote.priceUsd, currency, rate);
        const change = Number.isFinite(quote.change24hPct) ? quote.change24hPct : null;

        return (
          <Link
            key={symbol}
            href={`/app/accion/${encodeURIComponent(symbol)}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border/60 bg-surface-1/60 px-3 py-1.5 text-xs transition-colors hover:border-fg/30 hover:bg-surface-2"
          >
            <span className="font-semibold text-fg">{tag}</span>
            <span className="text-[11px] text-fg-muted num">{symbol}</span>
            {price !== null ? <span className="num font-medium text-fg">{formatMoney(price, currency)}</span> : null}
            {change !== null ? <ChangeBadge value={change} /> : null}
          </Link>
        );
      })}

      {isUsableRate(rate) ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-brand/25 bg-brand-soft/40 px-3 py-1.5 text-xs font-medium text-fg num">
          <span>Dólar ref.</span>
          <span className="font-semibold">{formatMoney(rate, "CLP")}</span>
        </span>
      ) : null}
    </section>
  );
}

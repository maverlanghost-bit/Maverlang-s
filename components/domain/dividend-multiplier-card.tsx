"use client";

import { Badge } from "@/components/ui/badge";
import { formatClp, formatMultiplier, formatShares, formatUsd } from "@/lib/format";
import { useT } from "@/lib/hooks/use-t";
import type { Currency, Position, Quote } from "@/lib/types";

/** Unidades crudas del ejemplo: matemática pública, sin exponer tenencias. */
const EXAMPLE_RAW_UNITS = 10;
const MASK = "••••••";

/**
 * Multiplicador de dividendos: la fórmula como una línea de texto y una lista
 * de hairlines. Sin caja de fondo ni pastillas de color; la cifra manda.
 */
export function DividendMultiplierCard({
  positions,
  quotesBySymbol,
  currency,
  rate,
  masked = false,
}: {
  positions: readonly Position[];
  quotesBySymbol?: ReadonlyMap<string, Quote>;
  currency: Currency;
  rate?: number;
  masked?: boolean;
}) {
  const { language } = useT();
  const isEn = language === "en";

  if (positions.length === 0) return null;

  // CLP sin tasa válida cae a USD, igual que el resto de la app.
  const formatValue = (usd: number): string => {
    if (currency === "CLP" && typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
      return formatClp(usd * rate);
    }
    return formatUsd(usd);
  };

  return (
    <section className="border-t border-border pt-8">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 max-w-prose">
          <h2 className="text-xl font-medium tracking-tight text-balance text-fg">
            {isEn ? "Dividend multiplier" : "Multiplicador de dividendos"}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
            {isEn
              ? "Every tokenized stock on Solana carries a multiplier: the shares you see are the raw units × that multiplier."
              : "Cada acción tokenizada en Solana lleva un multiplicador: las acciones que ves son las unidades crudas × ese multiplicador."}
          </p>
        </div>
        <Badge tone="neutral" className="shrink-0">
          xStocks
        </Badge>
      </div>

      {/* Fórmula de ARQUITECTURA §6: acciones = crudo × multiplicador */}
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] leading-5 text-fg-muted">
        <span>{isEn ? "Raw units" : "Unidades crudas"}</span>
        <span>×</span>
        <span>{isEn ? "Multiplier" : "Multiplicador"}</span>
        <span>=</span>
        <span className="font-medium text-fg">{isEn ? "Shares" : "Acciones"}</span>
      </p>

      <ul
        aria-label={isEn ? "Multiplier by position" : "Multiplicador por posición"}
        className="mt-2 divide-y divide-border border-t border-border"
      >
        {positions.map((position) => {
          const quote = quotesBySymbol?.get(position.symbol);
          const multiplier = Number.isFinite(position.multiplier) ? position.multiplier : 0;
          const exampleShares = multiplier > 0 ? EXAMPLE_RAW_UNITS * multiplier : 0;
          const exampleValueUsd =
            quote && multiplier > 0 && Number.isFinite(quote.priceUsd) ? exampleShares * quote.priceUsd : null;

          return (
            <li
              key={position.symbol}
              className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
            >
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="num truncate text-[15px] font-medium tracking-tight text-fg">{position.symbol}</span>
                <span className="num shrink-0 text-[13px] text-fg-muted">×{formatMultiplier(multiplier)}</span>
              </div>

              {masked ? (
                <p className="num text-xs text-fg-muted">
                  {MASK}
                  <span className="sr-only">{isEn ? "Figures hidden" : "Cifras ocultas"}</span>
                </p>
              ) : (
                <div className="flex items-baseline justify-between gap-4 sm:flex-col sm:items-end sm:gap-0.5">
                  <p className="num text-xs text-fg-muted">
                    {multiplier > 0
                      ? `${EXAMPLE_RAW_UNITS} × ${formatMultiplier(multiplier)} = ${formatShares(exampleShares)}`
                      : "—"}
                  </p>
                  <p className="num text-[13px] font-medium tracking-tight text-fg">
                    {exampleValueUsd !== null
                      ? formatValue(exampleValueUsd)
                      : isEn
                        ? "No quote"
                        : "Sin cotización"}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p role="note" className="mt-4 max-w-prose text-xs leading-relaxed text-fg-muted">
        {isEn
          ? "The multiplier grows as xStocks reinvests dividends: the same raw units become more equivalent shares. Past returns do not guarantee future results."
          : "El multiplicador crece a medida que xStocks reinvierte dividendos: las mismas unidades crudas pasan a equivaler más acciones. Los rendimientos pasados no aseguran resultados futuros."}
      </p>
    </section>
  );
}

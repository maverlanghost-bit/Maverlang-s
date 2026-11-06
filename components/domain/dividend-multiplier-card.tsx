"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatClp, formatMultiplier, formatShares, formatUsd } from "@/lib/format";
import { useT } from "@/lib/hooks/use-t";
import type { Currency, Position, Quote } from "@/lib/types";

/** Unidades crudas del ejemplo: matemática pública, sin exponer tenencias. */
const EXAMPLE_RAW_UNITS = 10;
const MASK = "••••••";

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
    <Card className="p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-balance text-fg">
            {isEn ? "Dividend multiplier" : "Multiplicador de dividendos"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-fg-body">
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
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border/70 bg-surface-2/60 px-3 py-2.5 text-xs">
        <span className="font-medium text-fg-body">{isEn ? "Raw units" : "Unidades crudas"}</span>
        <span aria-hidden="true" className="text-fg-muted">
          ×
        </span>
        <span className="font-medium text-fg-body">{isEn ? "Multiplier" : "Multiplicador"}</span>
        <span aria-hidden="true" className="text-fg-muted">
          =
        </span>
        <span className="font-semibold text-fg">{isEn ? "Shares" : "Acciones"}</span>
      </div>

      <ul
        aria-label={isEn ? "Multiplier by position" : "Multiplicador por posición"}
        className="mt-3 flex flex-col gap-2"
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
              className="flex flex-col gap-1 rounded-xl border border-border/70 bg-bg/60 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold text-fg">{position.symbol}</span>
                <Badge tone={multiplier > 1 ? "up" : "neutral"} className="num">
                  ×{formatMultiplier(multiplier)}
                </Badge>
              </div>

              {masked ? (
                <p className="num text-xs text-fg-muted">
                  {MASK}
                  <span className="sr-only">{isEn ? "Figures hidden" : "Cifras ocultas"}</span>
                </p>
              ) : (
                <div className="flex items-baseline justify-between gap-3 sm:flex-col sm:items-end sm:gap-0.5">
                  <p className="num text-xs text-fg-muted">
                    {multiplier > 0
                      ? `${EXAMPLE_RAW_UNITS} × ${formatMultiplier(multiplier)} = ${formatShares(exampleShares)}`
                      : "—"}
                  </p>
                  <p className="num text-[13px] font-semibold text-fg">
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

      <p role="note" className="mt-3 rounded-xl bg-surface-2/60 px-3 py-2.5 text-[11px] leading-relaxed text-fg-muted">
        {isEn
          ? "The multiplier grows as xStocks reinvests dividends: the same raw units become more equivalent shares. Past returns do not guarantee future results."
          : "El multiplicador crece a medida que xStocks reinvierte dividendos: las mismas unidades crudas pasan a equivaler más acciones. Los rendimientos pasados no aseguran resultados futuros."}
      </p>
    </Card>
  );
}

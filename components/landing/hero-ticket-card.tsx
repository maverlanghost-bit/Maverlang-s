"use client";

import Link from "next/link";

import { BentoCard } from "@/components/landing/bento";
import { useLandingQuote } from "@/components/landing/live-landing-prices";
import { formatShares, formatUsd } from "@/lib/format";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";
import type { LandingQuote } from "@/lib/mocks/landing";

/**
 * Boleta de ejemplo del bento del hero (T70): con el mínimo de la plataforma,
 * cuántas fracciones salen al precio que muestra la ficha. Es el mismo cálculo
 * de siempre (`LANDING_MIN_ORDER_USD / precio`) y se rotula como ejemplo; no
 * es una orden ni una cotización firme. El enlace lleva al registro de la demo.
 */
export function HeroTicketCard({ quote, className }: { quote: LandingQuote; className?: string }) {
  const { priceUsd } = useLandingQuote(quote.symbol, { priceUsd: quote.priceUsd, change: quote.change });
  const valid = Number.isFinite(priceUsd) && priceUsd > 0;

  return (
    <BentoCard tone="muted" padded={false} className={className}>
      <div className="flex h-full flex-col gap-4 p-5 md:p-6">
        <p className="label">Boleta de ejemplo</p>

        {valid ? (
          <dl className="divide-y divide-border border-y border-border">
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-sm text-fg-muted">Con</dt>
              <dd className="num text-sm text-fg">US${LANDING_MIN_ORDER_USD}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-sm text-fg-muted">Recibes aprox.</dt>
              <dd className="num min-w-0 text-right text-base font-medium text-fg">
                {formatShares(LANDING_MIN_ORDER_USD / priceUsd)} {quote.symbol}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="border-y border-border py-3 text-sm text-fg-muted">
            El ejemplo no está disponible sin un precio válido.
          </p>
        )}

        <p className="text-sm leading-relaxed text-fg-muted">
          {valid ? (
            <>
              Ejemplo al precio mostrado ({formatUsd(priceUsd)}). La cantidad exacta depende del precio al
              confirmar.
            </>
          ) : (
            "Vuelve a intentar en un momento."
          )}
        </p>

        <Link
          href="/app/registro"
          className="mt-auto inline-flex min-h-11 w-fit items-center text-sm font-medium text-fg"
        >
          <span className="border-b border-border-strong pb-0.5 transition-colors hover:border-fg">
            Probar en la demo →
          </span>
        </Link>
      </div>
    </BentoCard>
  );
}

import type { ReactNode } from "react";
import { PriceText } from "@/components/domain/price-text";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { TickerRow } from "@/components/domain/ticker-row";
import { Card } from "@/components/ui/card";
import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { LandingPrice, LandingSharesValue } from "@/components/landing/live-landing-prices";
import { landingNotice } from "@/lib/landing/live-quotes";
import type { LandingQuote } from "@/lib/mocks/landing";
import { formatShares } from "@/lib/format";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

/** Fracción de ejemplo. No es una cotización ni lo que compras con $1.000. */
const SAMPLE_SHARES = 0.0438;

function DepositMock() {
  return (
    <div className="rounded-xl bg-bg px-4 py-5">
      <p className="label">Ejemplo de depósito</p>
      <PriceText value={10000} currency="CLP" size="md" className="mt-2" />
      <p className="mt-3 text-sm text-fg-muted">Khipu · Transferencia</p>
    </div>
  );
}

function PickMock({ quote, live }: { quote: LandingQuote; live: boolean }) {
  return (
    <div className="rounded-xl bg-bg">
      <TickerRow
        href={quote.href}
        symbol={quote.symbol}
        name={quote.name}
        logoUrl={quote.logo}
        price={quote.priceUsd}
        currency="USD"
        change={quote.change}
        priceSlot={
          <LandingPrice
            symbol={quote.symbol}
            initial={{ priceUsd: quote.priceUsd, change: quote.change }}
          />
        }
      />
      <p className="px-3 pb-3 text-sm text-fg-muted">{landingNotice(live)}</p>
    </div>
  );
}

function OwnedMock({ quote }: { quote: LandingQuote }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-bg px-4 py-4">
      <TickerLogo symbol={quote.symbol} name={quote.name} logoUrl={quote.logo} size={40} decorative />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-fg">{formatShares(SAMPLE_SHARES)}</span>
        <span className="block text-sm text-fg-muted">Ejemplo. No es un saldo.</span>
      </span>
      <LandingSharesValue symbol={quote.symbol} shares={SAMPLE_SHARES} initialPrice={quote.priceUsd} />
    </div>
  );
}

/**
 * El depósito sigue en pesos (se deposita en CLP); los precios de acciones
 * van en dólares (M42), en vivo cuando la fuente responde.
 */
export function HowItWorks({ quotes, live }: { quotes: LandingQuote[]; live: boolean }) {
  const sampleQuote = quotes.find((quote) => quote.symbol === "AAPLx") ?? quotes[0];

  const steps: { kicker: string; title: string; body: string; mock: ReactNode }[] = [
    {
      kicker: "01",
      title: "Deposita pesos (Khipu, transferencia)",
      body: "El método y el costo del proveedor se ven al depositar.",
      mock: <DepositMock />,
    },
    {
      kicker: "02",
      title: "Elige una acción",
      body: "Apple, NVIDIA y las demás del catálogo.",
      mock: sampleQuote ? <PickMock quote={sampleQuote} live={live} /> : null,
    },
    {
      kicker: "03",
      title: "Listo: el token es tuyo, en tu billetera",
      body: "Queda en tu billetera y sigue el precio de la acción.",
      mock: sampleQuote ? <OwnedMock quote={sampleQuote} /> : null,
    },
  ];

  return (
    <LandingSection id="como-funciona" titleId="como-funciona-title">
      <Reveal>
        <SectionIntro id="como-funciona-title" label="03 — Cómo funciona" title="Tres pasos, en pesos">
          Depositas, eliges la acción y el token queda en tu billetera. Los montos de abajo son ejemplos.
        </SectionIntro>
      </Reveal>
      <div className="mt-10 grid gap-4 md:mt-14 md:grid-cols-3">
        {steps.map((step, index) => (
          <Reveal key={step.kicker} delay={(index + 1) * REVEAL_STAGGER_MS} className="h-full">
            <Card className="flex h-full flex-col gap-6">
              <div>
                <p className="label">{step.kicker}</p>
                <h3 className="mt-3 text-base leading-relaxed">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-body">{step.body}</p>
              </div>
              <div className="mt-auto">{step.mock}</div>
            </Card>
          </Reveal>
        ))}
      </div>
    </LandingSection>
  );
}

import type { ReactNode } from "react";
import { PriceText } from "@/components/domain/price-text";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { TickerRow } from "@/components/domain/ticker-row";
import { Card } from "@/components/ui/card";
import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { ILLUSTRATIVE_NOTICE, landingQuotes } from "@/lib/mocks/landing";
import { formatShares } from "@/lib/format";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

/** Fracción de ejemplo. No es una cotización ni lo que compras con $1.000. */
const SAMPLE_SHARES = 0.0438;

const sampleQuote = landingQuotes.find((quote) => quote.symbol === "AAPLx") ?? landingQuotes[0];

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
    mock: <PickMock />,
  },
  {
    kicker: "03",
    title: "Listo: es tuya, en tu billetera",
    body: "La fracción queda en la billetera de tu cuenta.",
    mock: <OwnedMock />,
  },
];

function DepositMock() {
  return (
    <div className="rounded-xl bg-bg px-4 py-5">
      <p className="label">Ejemplo de depósito</p>
      <PriceText value={10000} currency="CLP" size="md" className="mt-2" />
      <p className="mt-3 text-sm text-fg-muted">Khipu · Transferencia</p>
    </div>
  );
}

function PickMock() {
  if (!sampleQuote) return null;

  return (
    <div className="rounded-xl bg-bg">
      <TickerRow
        href={sampleQuote.href}
        symbol={sampleQuote.symbol}
        name={sampleQuote.name}
        price={sampleQuote.priceUsd}
        currency="USD"
        change={sampleQuote.change}
        sparkline={sampleQuote.sparkline}
      />
      <p className="px-3 pb-3 text-xs text-fg-muted">{ILLUSTRATIVE_NOTICE}</p>
    </div>
  );
}

function OwnedMock() {
  if (!sampleQuote) return null;

  const valueUsd = Math.round(sampleQuote.priceUsd * SAMPLE_SHARES * 100) / 100;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-bg px-4 py-4">
      <TickerLogo symbol={sampleQuote.symbol} name={sampleQuote.name} size={40} decorative />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-fg">{formatShares(SAMPLE_SHARES)}</span>
        <span className="block text-sm text-fg-muted">Ejemplo. No es un saldo.</span>
      </span>
      <PriceText value={valueUsd} currency="USD" size="sm" className="shrink-0" />
    </div>
  );
}

export function HowItWorks() {
  return (
    <LandingSection id="como-funciona" titleId="como-funciona-title">
      <Reveal>
        <SectionIntro id="como-funciona-title" label="03 — Cómo funciona" title="Tres pasos, en pesos">
          Depositas, eliges la acción y queda en tu billetera. Los montos de abajo son ejemplos.
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

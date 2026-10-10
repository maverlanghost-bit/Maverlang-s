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
      <p className="label">Ejemplo de saldo demo</p>
      <PriceText value={10000} currency="USD" size="md" className="mt-2" />
      <p className="mt-3 text-sm text-fg-muted">US$10.000 ficticios · precios reales</p>
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
 * La demo opera en dólares (US$): saldo ficticio de US$10.000 y precios de
 * acciones en vivo cuando la fuente responde. El depósito de dinero real
 * queda en neutro ("cuando haya cuentas reales"), sin afirmar pesos como
 * método activo.
 */
export function HowItWorks({ quotes, live }: { quotes: LandingQuote[]; live: boolean }) {
  const sampleQuote = quotes.find((quote) => quote.symbol === "AAPLx") ?? quotes[0];

  const steps: { title: string; body: string; mock: ReactNode }[] = [
    {
      title: "Practica con US$10.000 ficticios",
      body: "La demo trae saldo ficticio en dólares. Cuando haya cuentas reales, el método y el costo del proveedor se ven al depositar.",
      mock: <DepositMock />,
    },
    {
      title: "Elige una acción",
      body: "Apple, NVIDIA y las demás del catálogo.",
      mock: sampleQuote ? <PickMock quote={sampleQuote} live={live} /> : null,
    },
    {
      title: "Listo: el token es tuyo, en tu billetera",
      body: "Queda en tu propia billetera —nosotros no custodiamos tus activos— y sigue el precio de la acción.",
      mock: sampleQuote ? <OwnedMock quote={sampleQuote} /> : null,
    },
  ];

  return (
    <LandingSection id="como-funciona" titleId="como-funciona-title">
      <Reveal>
        <SectionIntro id="como-funciona-title" title="Tres pasos, en dólares (US$)">
          Practicas con US$10.000 ficticios, eliges la acción y el token queda en tu propia billetera, sin custodia de nuestra parte. Los montos de abajo son ejemplos. Cuando haya cuentas reales, el depósito y su costo se muestran en ese paso.
        </SectionIntro>
      </Reveal>
      <div className="mt-10 grid gap-4 md:mt-14 md:grid-cols-3">
        {steps.map((step, index) => (
          <Reveal key={step.title} delay={(index + 1) * REVEAL_STAGGER_MS} className="h-full">
            <Card className="flex h-full flex-col gap-6">
              <div>
                <h3 className="text-base leading-relaxed">{step.title}</h3>
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

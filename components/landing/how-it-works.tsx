import type { ReactNode } from "react";
import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { TickerLogo } from "@/components/domain/ticker-logo";
import type { LandingQuote } from "@/lib/mocks/landing";
import { formatMoney, formatPercent, formatShares } from "@/lib/format";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";
import { cn } from "@/lib/cn";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

function sampleShares(quote: LandingQuote): number {
  return Number.isFinite(quote.priceUsd) && quote.priceUsd > 0
    ? LANDING_MIN_ORDER_USD / quote.priceUsd
    : 0;
}

function BalanceMock() {
  return (
    <div className="flex h-full flex-col">
      <p className="text-[13px] leading-none text-fg-muted">Saldo de práctica</p>
      <p className="num mt-3 text-xl leading-none text-fg sm:text-2xl">
        {formatMoney(10000, "USD")}
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
        Dólares ficticios. No es dinero depositado.
      </p>
    </div>
  );
}

function PickMock({ quote }: { quote: LandingQuote }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <TickerLogo
            symbol={quote.symbol}
            name={quote.name}
            logoUrl={quote.logo}
            size={32}
            decorative
            loading="lazy"
            sizes="32px"
          />
          <div className="min-w-0">
            <p className="num text-[13px] leading-none text-fg">{quote.symbol}</p>
            <p className="mt-1 truncate text-[13px] leading-snug text-fg-muted">{quote.name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="num text-sm leading-none text-fg">{formatMoney(quote.priceUsd, "USD")}</p>
          <p
            className={cn(
              "num mt-1 text-[13px] leading-none",
              quote.change > 0 ? "text-up" : quote.change < 0 ? "text-down" : "text-fg-muted",
            )}
          >
            {formatPercent(quote.change)}
          </p>
        </div>
      </div>
    </div>
  );
}

function OwnedMock({ quote }: { quote: LandingQuote }) {
  const shares = sampleShares(quote);
  return (
    <div className="flex h-full flex-col">
      <p className="text-[13px] leading-none text-fg-muted">Posición de ejemplo</p>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="num text-xl leading-none text-fg">{formatShares(shares)}</span>
        <span className="num text-sm leading-none text-fg">
          {formatMoney(shares * quote.priceUsd, "USD")}
        </span>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
        {quote.symbol} en tu billetera, con el precio de la acción.
      </p>
    </div>
  );
}

/**
 * La demo opera en dólares (US$): saldo ficticio de US$10.000 y precios de
 * acciones en vivo cuando la fuente responde. El depósito de dinero real
 * queda para cuando haya cuentas reales, sin afirmar pesos como método activo.
 */
export function HowItWorks({
  quotes,
  live,
  showIntro = true,
}: {
  quotes: LandingQuote[];
  /** Con fuente viva, los precios no se anuncian como de muestra. */
  live: boolean;
  /** En /como-funciona el titular de la página ya presenta la sección. */
  showIntro?: boolean;
}) {
  const sampleQuote = quotes.find((quote) => quote.symbol === "AAPLx") ?? quotes[0];
  const introBody = live
    ? "Practicas con US$10.000 ficticios, eliges la acción y el token queda en tu propia billetera. Los montos de abajo son ejemplos."
    : "Practicas con US$10.000 ficticios, eliges la acción y el token queda en tu propia billetera. Los montos y precios de abajo son ejemplos.";

  const steps: {
    number: string;
    title: string;
    body: string;
    mock: ReactNode;
  }[] = [
    {
      number: "01",
      title: "Practica con US$10.000 ficticios",
      body: "El saldo de práctica es ficticio. Con cuentas reales, el depósito se muestra en ese paso.",
      mock: <BalanceMock />,
    },
    {
      number: "02",
      title: "Elige una acción",
      body: "Apple, NVIDIA y las demás del catálogo.",
      mock: sampleQuote ? <PickMock quote={sampleQuote} /> : null,
    },
    {
      number: "03",
      title: "El token queda en tu billetera",
      body: "Queda en tu propia billetera —nosotros no custodiamos tus activos— y sigue el precio de la acción.",
      mock: sampleQuote ? <OwnedMock quote={sampleQuote} /> : null,
    },
  ];

  return (
    <LandingSection id="como-funciona" titleId="como-funciona-title">
      {showIntro ? (
        <Reveal>
          <SectionIntro id="como-funciona-title" title="Tres pasos, en dólares (US$)">
            {introBody}
          </SectionIntro>
        </Reveal>
      ) : (
        <h2 id="como-funciona-title" className="sr-only">
          Tres pasos, en dólares (US$)
        </h2>
      )}
      <ol className="mt-10 grid list-none gap-x-8 gap-y-10 lg:mt-14 lg:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title}>
            <Reveal delay={(index + 1) * REVEAL_STAGGER_MS} className="border-t border-border pt-5">
              <p aria-hidden className="num text-[13px] leading-none text-fg-muted">
                {step.number}
              </p>

              {/* Altura común en escritorio: los tres mocks arrancan a la misma altura. */}
              <div className="lg:min-h-[8.5rem]">
                <h3 className="mt-5 text-[17px] leading-snug text-pretty sm:text-lg">{step.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-fg-body sm:text-[15px]">
                  {step.body}
                </p>
              </div>

              {/* Slot fijo: el mock no cambia el ritmo de la fila. */}
              <div className="mt-6 h-32 border-t border-border pt-4">{step.mock}</div>
            </Reveal>
          </li>
        ))}
      </ol>
    </LandingSection>
  );
}

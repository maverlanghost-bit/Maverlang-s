import type { ReactNode } from "react";
import { HowTabs, type HowTabStep } from "@/components/landing/how-tabs";
import { ProductFrame } from "@/components/landing/product-frame";
import { Reveal } from "@/components/landing/reveal";
import { SectionHeader, LandingSection } from "@/components/landing/section";
import { TickerLogo } from "@/components/domain/ticker-logo";
import type { LandingQuote } from "@/lib/mocks/landing";
import { formatMoney, formatPercent, formatShares } from "@/lib/format";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";
import { cn } from "@/lib/cn";
import { landingNotice } from "@/lib/landing/live-quotes";

const TITLE = "Tres pasos, en dólares (US$)";

function sampleShares(quote: LandingQuote): number {
  return Number.isFinite(quote.priceUsd) && quote.priceUsd > 0
    ? LANDING_MIN_ORDER_USD / quote.priceUsd
    : 0;
}

/** Pantalla de teléfono con la misma cabecera y alto mínimo en los tres pasos. */
function PhoneScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ProductFrame variant="phone" className="lg:max-w-[24rem]">
      <div className="flex min-h-[25rem] flex-col">
        <p className="border-b border-border pb-3 text-sm font-semibold tracking-tight text-fg">
          {title}
        </p>
        <div className="flex flex-1 flex-col pt-5">{children}</div>
      </div>
    </ProductFrame>
  );
}

function QuoteLine({ quote }: { quote: LandingQuote }) {
  return (
    <>
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
          <p className="num text-xs leading-none text-fg">{quote.symbol}</p>
          <p className="mt-1 truncate text-xs leading-snug text-fg-muted">{quote.name}</p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="num text-sm leading-none text-fg">{formatMoney(quote.priceUsd, "USD")}</p>
        <p
          className={cn(
            "num mt-1 text-sm leading-none",
            quote.change > 0 ? "text-up" : quote.change < 0 ? "text-down" : "text-fg-muted",
          )}
        >
          {formatPercent(quote.change)}
        </p>
      </div>
    </>
  );
}

function BalanceScreen() {
  return (
    <PhoneScreen title="Inicio">
      <p className="eyebrow leading-none">Saldo de práctica</p>
      <p className="num mt-3 text-4xl leading-none tracking-tight text-fg">
        {formatMoney(10000, "USD")}
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
        Dólares ficticios. No es dinero depositado.
      </p>
      <p className="mt-auto rounded-xl bg-surface-1 p-4 text-[15px] leading-relaxed text-fg-body">
        Siguiente: elige una acción del catálogo.
      </p>
    </PhoneScreen>
  );
}

function PickScreen({ quotes, sample }: { quotes: LandingQuote[]; sample: LandingQuote | undefined }) {
  if (!sample) {
    return (
      <PhoneScreen title="Mercado">
        <p className="text-[15px] leading-relaxed text-fg-muted">
          Las cotizaciones de ejemplo no están disponibles por ahora.
        </p>
      </PhoneScreen>
    );
  }
  const rows = [sample, ...quotes.filter((quote) => quote.symbol !== sample.symbol)].slice(0, 4);
  return (
    <PhoneScreen title="Mercado">
      <p className="eyebrow leading-none">Acciones del catálogo</p>
      <ul className="mt-4 grid list-none gap-2">
        {rows.map((quote) => (
          <li
            key={quote.symbol}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-3 py-3",
              quote.symbol === sample.symbol ? "border-fg bg-surface-1" : "border-border",
            )}
          >
            <QuoteLine quote={quote} />
          </li>
        ))}
      </ul>
    </PhoneScreen>
  );
}

function OwnedScreen({ sample }: { sample: LandingQuote | undefined }) {
  if (!sample) {
    return (
      <PhoneScreen title="Cartera">
        <p className="text-[15px] leading-relaxed text-fg-muted">
          La posición de ejemplo no está disponible por ahora.
        </p>
      </PhoneScreen>
    );
  }
  const shares = sampleShares(sample);
  return (
    <PhoneScreen title="Cartera">
      <p className="eyebrow leading-none">Posición de ejemplo</p>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-3">
        <QuoteLine quote={sample} />
      </div>
      <div className="mt-6 flex items-baseline justify-between gap-3">
        <span className="num text-3xl leading-none tracking-tight text-fg">{formatShares(shares)}</span>
        <span className="num text-sm leading-none text-fg">
          {formatMoney(shares * sample.priceUsd, "USD")}
        </span>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
        {sample.symbol} en tu billetera, con el precio de la acción.
      </p>
      <p className="mt-auto rounded-xl bg-surface-1 p-4 text-[15px] leading-relaxed text-fg-body">
        Tu propia billetera: nosotros no custodiamos tus activos.
      </p>
    </PhoneScreen>
  );
}

/**
 * La demo opera en dólares (US$): saldo ficticio de US$10.000 y precios de
 * acciones en vivo cuando la fuente responde. El depósito de dinero real
 * queda para cuando haya cuentas reales, sin afirmar pesos como método activo.
 *
 * T70: bloque dividido. Pasos como pestañas a la izquierda y, a la derecha, el
 * teléfono con la pantalla del paso (`HowTabs`, cliente). En móvil los tres
 * pasos van apilados con su pantalla.
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

  const steps: HowTabStep[] = [
    {
      number: "01",
      title: "Practica con US$10.000 ficticios",
      body: "El saldo de práctica es ficticio. Con cuentas reales, el depósito se muestra en ese paso.",
    },
    {
      number: "02",
      title: "Elige una acción",
      body: "Apple, NVIDIA y las demás del catálogo.",
    },
    {
      number: "03",
      title: "El token queda en tu billetera",
      body: "Queda en tu propia billetera —nosotros no custodiamos tus activos— y sigue el precio de la acción.",
    },
  ];

  const panels: ReactNode[] = [
    <BalanceScreen key="balance" />,
    <PickScreen key="pick" quotes={quotes} sample={sampleQuote} />,
    <OwnedScreen key="owned" sample={sampleQuote} />,
  ];

  const header = showIntro ? (
    <SectionHeader id="como-funciona-title" eyebrow="Cómo funciona" title={TITLE}>
      {introBody}
    </SectionHeader>
  ) : (
    <h2 id="como-funciona-title" className="sr-only">
      {TITLE}
    </h2>
  );

  return (
    <LandingSection id="como-funciona" titleId="como-funciona-title">
      <Reveal>
        <HowTabs header={header} steps={steps} panels={panels} />
      </Reveal>
      <p className="mt-8 text-[13px] leading-snug text-fg-muted">{landingNotice(live)}.</p>
    </LandingSection>
  );
}

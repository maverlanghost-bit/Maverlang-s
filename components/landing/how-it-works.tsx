import type { ReactNode } from "react";
import { PriceText } from "@/components/domain/price-text";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { TickerRow } from "@/components/domain/ticker-row";
import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { LandingPrice, LandingSharesValue } from "@/components/landing/live-landing-prices";
import { landingNotice } from "@/lib/landing/live-quotes";
import type { LandingQuote } from "@/lib/mocks/landing";
import { formatShares } from "@/lib/format";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

/** Fracción de ejemplo. No es una cotización ni lo que compras con $1.000. */
const SAMPLE_SHARES = 0.0438;

/**
 * Íconos de los pasos: SVG propio (en `@/components/ui/icons` no hay billetera
 * ni llave). Trazo `currentColor`, decorativos.
 */
const stepIconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: "size-5",
} as const;

/** 01 · saldo demo: billetera. */
function WalletIcon() {
  return (
    <svg {...stepIconProps}>
      <path d="M6 4.5h10.5A2.5 2.5 0 0 1 19 7v1" />
      <rect x="3" y="6" width="18" height="13.5" rx="3.25" />
      <path d="M15.75 12.75h2.75" />
    </svg>
  );
}

/** 02 · mercado: gráfico de barras. */
function BarsIcon() {
  return (
    <svg {...stepIconProps}>
      <path d="M3.5 19.5h17" />
      <path d="M7.5 19.5v-5.5" />
      <path d="M12 19.5v-9.5" />
      <path d="M16.5 19.5v-13" />
    </svg>
  );
}

/** 03 · autocustodia: llave en tu poder. */
function KeyIcon() {
  return (
    <svg {...stepIconProps}>
      <circle cx="8.5" cy="8.5" r="3.5" />
      <path d="M11 11l8.5 8.5" />
      <path d="M16.2 16.2l-1.6 1.6" />
      <path d="M18.4 18.4l-1.6 1.6" />
    </svg>
  );
}

/** Píldora de estado con punto: verde para lo confirmado, neutra para el resto. */
function StatusPill({
  children,
  tone = "up",
}: {
  children: ReactNode;
  tone?: "up" | "neutral";
}) {
  const toneClass =
    tone === "up" ? "border-up/20 bg-up-bg text-up" : "border-border bg-surface-2 text-fg-muted";
  const dotClass = tone === "up" ? "bg-up" : "bg-fg-muted";
  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] leading-5 font-medium ${toneClass}`}
    >
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dotClass}`} />
      {children}
    </span>
  );
}

function DepositMock() {
  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-4 shadow-[0_1px_2px_rgba(10,10,10,0.03)]">
      <p className="label">Ejemplo de saldo demo</p>
      <PriceText value={10000} currency="USD" size="md" className="mt-2 block" />
      <p className="mt-1.5 text-sm text-fg-muted">US$10.000 ficticios · precios reales</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <StatusPill>Saldo demo confirmado</StatusPill>
      </div>
    </div>
  );
}

function PickMock({ quote, live }: { quote: LandingQuote; live: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-2 shadow-[0_1px_2px_rgba(10,10,10,0.03)]">
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
      <p className="mt-2 px-2 text-xs text-fg-muted">{landingNotice(live)}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border px-2 pt-2.5 pb-1">
        <StatusPill tone={live ? "up" : "neutral"}>
          {live ? "Cotización en vivo" : "Cotización de referencia"}
        </StatusPill>
        <span aria-hidden className="num text-[11px] tracking-[0.08em] text-fg-muted uppercase">
          {quote.symbol}
        </span>
      </div>
    </div>
  );
}

function OwnedMock({ quote }: { quote: LandingQuote }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-4 shadow-[0_1px_2px_rgba(10,10,10,0.03)]">
      <div className="flex items-center gap-3">
        <TickerLogo symbol={quote.symbol} name={quote.name} logoUrl={quote.logo} size={40} decorative loading="lazy" sizes="40px" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-fg">{formatShares(SAMPLE_SHARES)}</span>
          <span className="block text-sm text-fg-muted">Ejemplo. No es un saldo.</span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <StatusPill>Confirmado en Solana</StatusPill>
        <LandingSharesValue symbol={quote.symbol} shares={SAMPLE_SHARES} initialPrice={quote.priceUsd} />
      </div>
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

  const steps: {
    number: string;
    label: string;
    icon: ReactNode;
    title: string;
    body: string;
    mock: ReactNode;
  }[] = [
    {
      number: "01",
      label: "PASO 01 · DEMO",
      icon: <WalletIcon />,
      title: "Practica con US$10.000 ficticios",
      body: "La demo trae saldo ficticio en dólares. Cuando haya cuentas reales, el método y el costo del proveedor se ven al depositar.",
      mock: <DepositMock />,
    },
    {
      number: "02",
      label: "PASO 02 · MERCADO",
      icon: <BarsIcon />,
      title: "Elige una acción",
      body: "Apple, NVIDIA y las demás del catálogo.",
      mock: sampleQuote ? <PickMock quote={sampleQuote} live={live} /> : null,
    },
    {
      number: "03",
      label: "PASO 03 · AUTOCUSTODIA",
      icon: <KeyIcon />,
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
      <ol className="mt-10 grid list-none gap-4 md:mt-14 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="relative h-full">
            <Reveal delay={(index + 1) * REVEAL_STAGGER_MS} className="h-full">
              <article className="flex h-full flex-col rounded-3xl border border-border bg-bg p-5 shadow-[0_1px_2px_rgba(10,10,10,0.04)] md:p-6">
                <header className="border-b border-border pb-5">
                  <div className="flex items-start justify-between gap-3">
                    <p
                      aria-hidden
                      className="num text-[2rem] leading-none font-medium tracking-tight text-fg"
                    >
                      {step.number}
                    </p>
                    <span
                      aria-hidden
                      className="grid size-10 shrink-0 place-items-center rounded-2xl border border-border bg-surface-1 text-fg"
                    >
                      {step.icon}
                    </span>
                  </div>
                  <p className="label mt-4">{step.label}</p>
                </header>

                <h3 className="mt-5 text-base leading-relaxed">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-body">{step.body}</p>

                <div className="mt-auto pt-5">{step.mock}</div>
              </article>
            </Reveal>
            {index < steps.length - 1 ? (
              <span
                aria-hidden
                className="pointer-events-none absolute top-[2.5rem] -right-4 hidden w-4 items-center md:flex"
              >
                <span className="h-px flex-1 bg-gradient-to-r from-border-strong/70 to-border" />
                <span className="size-1.5 rotate-45 border-t border-r border-border-strong" />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </LandingSection>
  );
}

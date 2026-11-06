import type { ComponentType, ReactNode, SVGProps } from "react";
import Link from "next/link";
import { AnnouncementPill } from "@/components/landing/announcement-pill";
import { LandingPrice } from "@/components/landing/live-landing-prices";
import { TickerRow } from "@/components/domain/ticker-row";
import { Button } from "@/components/ui/button";
import { IconChart, IconClock, IconWallet } from "@/components/ui/icons";
import { esCL } from "@/content/i18n/es-CL";
import { landingNotice } from "@/lib/landing/live-quotes";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";
import { HERO_SYMBOLS, type LandingQuote } from "@/lib/mocks/landing";
import { cn } from "@/lib/cn";

/**
 * Copy en uso:
 * H1: "Acciones de EE.UU. tokenizadas, en tu billetera"
 * Línea bajo el H1: "Comprar acciones de EE.UU. desde Chile."
 * Subtítulo: "Compra fracciones desde US$10. El token queda en tu propia billetera —nosotros no custodiamos tus activos—, compras en dólares (US$) y operas 24/7."
 * CTAs: "Prueba la demo gratis" → /app/registro · "Ver acciones" → /acciones · "Cómo funciona" → #como-funciona
 *
 * ALTERNATIVA:
 * H1: "El token es tuyo, en tu propia billetera"
 * Subtítulo: "Fracciones de acciones de EE.UU. desde US$10, comprando en dólares (US$). Operas 24/7."
 *
 * ALTERNATIVA:
 * H1: "Fracciones de EE.UU. en Solana, comprando en dólares"
 * Subtítulo: "Tokenizadas, desde US$10, en tu billetera. Operas 24/7, sin cuenta en una corredora de EE.UU."
 */

const trustChips: { label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { label: "Opera 24/7", Icon: IconClock },
  { label: "En tu propia billetera, sin custodia", Icon: IconWallet },
  { label: "Más de 400 activos", Icon: IconChart },
];

/** Pie de la terminal: tres datos duros, sin adornos. */
const terminalMetrics: { label: string; value: string; mono?: boolean }[] = [
  { label: "Mínimo", value: `US$${LANDING_MIN_ORDER_USD}`, mono: true },
  { label: "Comisión", value: "0%", mono: true },
  { label: "Custodia", value: "Tu propia billetera" },
];

function Reveal({
  delay,
  className,
  children,
}: {
  delay: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("motion-safe:animate-reveal", className)} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Grilla decorativa de 1px que se desvanece hacia los bordes. */
const heroGridStyle = {
  backgroundImage:
    "linear-gradient(to right, rgba(10,10,10,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(10,10,10,0.05) 1px, transparent 1px)",
  backgroundSize: "72px 72px",
  maskImage: "radial-gradient(ellipse 85% 65% at 50% 0%, #000 5%, transparent 72%)",
  WebkitMaskImage: "radial-gradient(ellipse 85% 65% at 50% 0%, #000 5%, transparent 72%)",
} as const;

/**
 * Precios reales en dólares cuando la fuente responde (M42); si no, la
 * muestra con "Precios ilustrativos". Sin series: el historial live no
 * es real. Sólo los números son cliente (`<LandingPrice>`).
 */
export function Hero({ quotes, live }: { quotes: LandingQuote[]; live: boolean }) {
  const heroQuotes = quotes.filter((quote) => HERO_SYMBOLS.has(quote.symbol));

  return (
    <section className="relative isolate overflow-hidden px-5 pt-10 pb-16 md:pt-16 md:pb-24 lg:pt-20">
      {/* Fondo ambiental: halo esmeralda/grafito + grilla con desvanecido. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-x-0 -top-32 h-[560px]"
          style={{
            background:
              "radial-gradient(58% 62% at 50% 0%, rgba(31,138,101,0.06) 0%, rgba(31,138,101,0.02) 46%, rgba(10,10,10,0) 76%), radial-gradient(42% 48% at 82% 8%, rgba(10,10,10,0.04) 0%, rgba(10,10,10,0) 72%)",
          }}
        />
        <div className="absolute inset-0" style={heroGridStyle} />
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        <Reveal delay={80} className="w-full">
          <AnnouncementPill />
        </Reveal>
        <Reveal delay={160} className="mt-6 w-full">
          <h1 className="text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Acciones de EE.UU. tokenizadas, en tu billetera
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-medium leading-relaxed text-balance text-fg sm:text-base">
            Comprar acciones de EE.UU. desde Chile.
          </p>
        </Reveal>
        <Reveal delay={240} className="mt-4 w-full">
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-balance text-fg-body sm:text-base">
            Compra fracciones desde US${LANDING_MIN_ORDER_USD}. El token queda en tu propia billetera
            —nosotros no custodiamos tus activos—, compras en dólares (US$) y operas 24/7.
          </p>
        </Reveal>
        <Reveal delay={320} className="mt-8 w-full">
          <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
            <Button asChild size="md" className="min-h-11 w-full sm:w-auto">
              <Link href="/app/registro">Prueba la demo gratis</Link>
            </Button>
            <Button asChild variant="secondary" size="md" className="min-h-11 w-full sm:w-auto">
              <Link href="/acciones">{esCL.guest.seeStocks}</Link>
            </Button>
            <Button asChild variant="ghost" size="md" className="min-h-11 w-full sm:w-auto">
              <Link href="/#como-funciona">Cómo funciona</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-fg-muted">
            Practica con US$10.000 ficticios y precios reales.
          </p>
          <ul className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-2">
            {trustChips.map((chip) => (
              <li
                key={chip.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-bg/70 px-3 py-1.5 text-xs leading-snug text-fg-body backdrop-blur-sm sm:text-sm"
              >
                <chip.Icon className="size-3.5 shrink-0 text-fg-muted" />
                {chip.label}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      <Reveal delay={400} className="mx-auto mt-12 w-full max-w-xl md:mt-16 md:max-w-2xl">
        <div className="overflow-hidden rounded-3xl border border-border bg-bg/85 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_8px_24px_-12px_rgba(10,10,10,0.12)] backdrop-blur-xl">
          {/* Barra superior de estado, tipo terminal financiera. */}
          <div className="flex flex-col gap-2.5 border-b border-border/70 bg-surface-1/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
                <span className="size-2 rounded-full bg-border-strong/60 sm:size-2.5" />
                <span className="size-2 rounded-full bg-border-strong/60 sm:size-2.5" />
                <span className="size-2 rounded-full bg-border-strong/60 sm:size-2.5" />
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-up/15 bg-up-bg px-2.5 py-1 text-[11px] leading-none font-medium text-up">
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-up motion-safe:animate-pulse motion-reduce:animate-none"
                />
                <span className="truncate">Solana Mainnet · xStocks 24/7</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span className={cn("label shrink-0", live && "text-up")}>{live ? "En vivo" : "Ejemplo"}</span>
              <span className="truncate text-xs text-fg-muted sm:text-[13px]">{landingNotice(live)}</span>
            </div>
          </div>

          <ul className="flex flex-col gap-1.5 p-2 sm:p-3">
            {heroQuotes.map((quote) => (
              <li key={quote.symbol}>
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
              </li>
            ))}
          </ul>

          {/* Pie: mínimo, comisión y custodia. */}
          <dl className="grid grid-cols-3 divide-x divide-border/70 border-t border-border/70 bg-surface-1/30">
            {terminalMetrics.map((metric) => (
              <div key={metric.label} className="min-w-0 px-3 py-3 sm:px-4">
                <dt className="label text-[10px]">{metric.label}</dt>
                <dd
                  className={cn(
                    "mt-1 text-xs leading-snug break-words text-fg sm:text-[13px]",
                    metric.mono && "num font-medium tabular-nums",
                  )}
                >
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Reveal>
    </section>
  );
}

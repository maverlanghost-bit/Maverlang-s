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
  { label: "Opera 24/7 on-chain", Icon: IconClock },
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

/**
 * Precios reales en dólares cuando la fuente responde (M42); si no, la
 * muestra con "Precios ilustrativos". Sin series: el historial live no
 * es real. Sólo los números son cliente (`<LandingPrice>`).
 */
export function Hero({ quotes, live }: { quotes: LandingQuote[]; live: boolean }) {
  const heroQuotes = quotes.filter((quote) => HERO_SYMBOLS.has(quote.symbol));

  return (
    <section className="relative isolate overflow-hidden px-4 pt-7 pb-14 sm:px-5 md:pt-16 md:pb-24 lg:pt-20">
      {/* Fondo ambiental: halo radial muy sutil en la parte superior. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-x-0 -top-32 h-[560px]"
          style={{
            background:
              "radial-gradient(58% 62% at 50% 0%, rgba(31,138,101,0.06) 0%, rgba(31,138,101,0.02) 46%, rgba(10,10,10,0) 76%), radial-gradient(42% 48% at 82% 8%, rgba(10,10,10,0.04) 0%, rgba(10,10,10,0) 72%)",
          }}
        />
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        <Reveal delay={80} className="w-full">
          <AnnouncementPill />
        </Reveal>
        <Reveal delay={160} className="mt-6 w-full">
          <h1 className="text-[32px] leading-[1.06] tracking-tight text-balance min-[400px]:text-4xl sm:text-5xl lg:text-6xl">
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
          <p className="mx-auto mt-3 max-w-2xl text-[11px] leading-relaxed text-balance text-fg-muted sm:text-xs">
            Operar on-chain es 24/7; fuera del horario de la bolsa de EE.UU. (9:30 a 16:00, hora de Nueva
            York, lunes a viernes) hay menos liquidez y el precio puede variar más.
          </p>
        </Reveal>
      </div>

      <Reveal delay={400} className="mx-auto mt-10 w-full max-w-2xl sm:mt-14 md:mt-16">
        <div className="rounded-3xl border border-border/80 bg-white/95 p-4 shadow-[0_18px_50px_-24px_rgba(10,10,10,0.10)] backdrop-blur-sm sm:p-6">
          {/* Cabecera ejecutiva sin semáforos ni barra de URL */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3.5 text-xs text-fg-muted">
            <div className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-up motion-safe:animate-pulse motion-reduce:animate-none"
              />
              <span className="font-medium text-fg">Cotizaciones 24/7</span>
              <span aria-hidden="true" className="text-border-strong">
                ·
              </span>
              <span>xStocks en Solana</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("label text-[10px]", live && "text-up")}>
                {live ? "En vivo" : "Ejemplo"}
              </span>
              <span aria-hidden="true" className="text-border-strong">
                ·
              </span>
              <span className="text-xs text-fg-muted">{landingNotice(live)}</span>
            </div>
          </div>

          {/* Lista limpia de cotizaciones */}
          <ul className="mt-1 divide-y divide-border/70">
            {heroQuotes.map((quote) => (
              <li key={quote.symbol} className="py-1">
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

          {/* Pie de métricas clave */}
          <dl className="mt-5 grid grid-cols-3 gap-2.5 border-t border-border/70 pt-4 sm:gap-8">
            {terminalMetrics.map((metric) => (
              <div key={metric.label} className="min-w-0">
                <dt className="label text-[10px] text-fg-muted">{metric.label}</dt>
                <dd
                  className={cn(
                    "mt-1 text-xs leading-snug break-words text-fg min-[400px]:text-sm sm:text-base",
                    metric.mono ? "num font-semibold tabular-nums" : "font-medium",
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

import type { ReactNode } from "react";
import Link from "next/link";
import { AnnouncementPill } from "@/components/landing/announcement-pill";
import { LandingLiveBadge, LandingPrice } from "@/components/landing/live-landing-prices";
import { TickerRow } from "@/components/domain/ticker-row";
import { Button } from "@/components/ui/button";
import { esCL } from "@/content/i18n/es-CL";
import { landingNotice } from "@/lib/landing/live-quotes";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";
import { HERO_SYMBOLS, type LandingQuote } from "@/lib/mocks/landing";
import { cn } from "@/lib/cn";

/**
 * Copy en uso:
 * H1: "Acciones de EE.UU. tokenizadas, en tu billetera"
 * Dek: "Acciones de EE.UU. desde Chile: fracciones desde US$10 y operas 24/7.
 *   Compras en dólares (US$) y el token queda en tu propia billetera —nosotros
 *   no custodiamos tus activos—."
 * CTAs: "Prueba la demo gratis" (primario) → /app/registro · "Ver acciones"
 *   (secundario) → /acciones · "Cómo funciona" (enlace de texto) → /#como-funciona
 * Nota: "Practica con US$10.000 ficticios y precios reales." vive en la
 *   cabecera de la tarjeta de cotizaciones; el aviso de horario, al pie de la
 *   cinta de precios. Se reubicaron: no se borró ninguno.
 *
 * ALTERNATIVA:
 * H1: "El token es tuyo, en tu propia billetera"
 * ALTERNATIVA:
 * H1: "Fracciones de EE.UU. en Solana, comprando en dólares"
 */

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
 *
 * Un H1 + un dek de 16 px: el resto del microtexto (nota de práctica y aviso
 * de horario) se movió a donde se lee, no se eliminó.
 */
export function Hero({ quotes, live }: { quotes: LandingQuote[]; live: boolean }) {
  const heroFiltered = quotes.filter((quote) => HERO_SYMBOLS.has(quote.symbol));
  // Si el catálogo llega sin los símbolos de la portada, se muestran los
  // primeros cuatro: mejor una tarjeta con datos reales que una vacía.
  const heroQuotes = (heroFiltered.length > 0 ? heroFiltered : quotes).slice(0, 4);

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
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-balance text-fg-body">
            Acciones de EE.UU. desde Chile: fracciones desde US${LANDING_MIN_ORDER_USD} y operas 24/7.
            Compras en dólares (US$) y el token queda en tu propia billetera —nosotros no custodiamos tus activos—.
          </p>
        </Reveal>

        <Reveal delay={240} className="mt-8 w-full">
          <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
            <Button asChild size="md" className="min-h-11 w-full sm:w-auto">
              <Link href="/app/registro">Prueba la demo gratis</Link>
            </Button>
            <Button asChild variant="secondary" size="md" className="min-h-11 w-full sm:w-auto">
              <Link href="/acciones">{esCL.guest.seeStocks}</Link>
            </Button>
            <Link
              href="/#como-funciona"
              className="inline-flex min-h-11 items-center justify-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg sm:ml-1"
            >
              Cómo funciona
            </Link>
          </div>
        </Reveal>
      </div>

      <Reveal delay={320} className="mx-auto mt-10 w-full max-w-2xl sm:mt-14 md:mt-16">
        <div className="rounded-3xl border border-border bg-bg p-4 shadow-[0_18px_50px_-24px_rgba(10,10,10,0.10)] sm:p-6">
          {/* Cabecera: origen de las cotizaciones y la nota de práctica. */}
          <div className="border-b border-border pb-3.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <p className="inline-flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
                <span className="font-medium text-fg">Cotizaciones 24/7</span>
                <span aria-hidden="true" className="text-fg-muted">
                  ·
                </span>
                <span>xStocks en Solana</span>
              </p>
              <LandingLiveBadge live={live} />
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">
              Practica con US$10.000 ficticios y precios reales.{" "}
              {live ? "Precios en dólares (US$)." : `${landingNotice(false)}.`}
            </p>
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
          <dl className="mt-5 grid grid-cols-3 gap-2.5 border-t border-border pt-4 sm:gap-8">
            {terminalMetrics.map((metric) => (
              <div key={metric.label} className="min-w-0">
                <dt className="label text-xs">{metric.label}</dt>
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

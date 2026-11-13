import Link from "next/link";
import { AnnouncementPill } from "@/components/landing/announcement-pill";
import { LandingLiveBadge, LandingPrice } from "@/components/landing/live-landing-prices";
import { TickerRow } from "@/components/domain/ticker-row";
import { Button } from "@/components/ui/button";
import { esCL } from "@/content/i18n/es-CL";
import { landingNotice } from "@/lib/landing/live-quotes";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";
import { HERO_SYMBOLS, type LandingQuote } from "@/lib/mocks/landing";

/**
 * Copy en uso:
 * H1: "Acciones de EE.UU. tokenizadas, en tu billetera"
 * Dek: "Compra fracciones desde US$10 y opera 24/7. El token queda en tu propia
 *   billetera —nosotros no custodiamos tus activos—."
 * Acciones: "Prueba la demo gratis" (primario) → /app/registro · "Ver acciones"
 *   (secundario sin relleno) → /acciones. Sin un tercer enlace: la sección
 *   "Cómo funciona" es el bloque siguiente, no hace falta pointer a ella.
 * Nota: "Practica con US$10.000 ficticios y precios reales." vive al pie del
 *   bloque de cotizaciones; el aviso de horario, al pie de la cinta de precios.
 *   Se reubicaron: no se borró ninguno.
 *
 * Sin relleno de color: el fondo es el blanco de la página; el hero no lleva
 * halo, tarjeta ni sombra. La jerarquía la hacen la escala del H1 y las
 * hairlines del bloque de datos.
 */
export function Hero({ quotes, live }: { quotes: LandingQuote[]; live: boolean }) {
  // Sólo cotizaciones con precio válido: mostrar US$0,00 sería inventar un
  // dato. Si el catálogo no trae los símbolos de portada, se usan los primeros.
  const priced = quotes.filter((quote) => Number.isFinite(quote.priceUsd) && quote.priceUsd > 0);
  const heroFiltered = priced.filter((quote) => HERO_SYMBOLS.has(quote.symbol));
  const heroQuotes = (heroFiltered.length > 0 ? heroFiltered : priced).slice(0, 4);

  return (
    <section aria-labelledby="hero-title" className="px-5 pt-10 pb-12 md:pt-14 md:pb-16">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        <AnnouncementPill />

        <h1
          id="hero-title"
          className="mx-auto mt-4 max-w-[46rem] text-[2rem] leading-[1.06] tracking-tight text-balance sm:text-[2.5rem] lg:text-5xl"
        >
          Acciones de EE.UU. tokenizadas, en tu billetera
        </h1>

        <p className="mx-auto mt-5 max-w-[36rem] text-pretty text-lead text-fg-body">
          Compra fracciones desde US${LANDING_MIN_ORDER_USD} y opera 24/7. El token queda en tu
          propia billetera —nosotros no custodiamos tus activos—.
        </p>

        <div className="mt-7 flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button asChild size="md" className="w-full sm:w-auto">
            <Link href="/app/registro">Prueba la demo gratis</Link>
          </Button>
          <Button asChild variant="ghost" size="md" className="w-full sm:w-auto">
            <Link href="/acciones">{esCL.guest.seeStocks}</Link>
          </Button>
        </div>
      </div>

      {/* Cotizaciones: tabla de datos, no tarjeta. Hairlines y nada más. */}
      <section aria-label="Cotizaciones" className="mx-auto mt-10 w-full max-w-2xl border-t border-border sm:mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-2 pt-3 sm:px-3">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="label text-fg">Cotizaciones 24/7</span>
            <span className="text-xs text-fg-muted">xStocks en Solana</span>
          </p>
          {heroQuotes.length > 0 ? (
            <LandingLiveBadge live={live} />
          ) : (
            <span className="text-xs font-medium text-fg-muted">Sin datos</span>
          )}
        </div>

        {heroQuotes.length > 0 ? (
          <ul className="mt-3 divide-y divide-border border-t border-border">
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
        ) : (
          <p className="mt-3 border-t border-border px-2 py-4 text-sm text-fg-muted sm:px-3">
            Las cotizaciones no están disponibles en este momento.
          </p>
        )}

        <p className="border-t border-border px-2 py-3 text-[13px] leading-relaxed text-fg-muted sm:px-3">
          Practica con US$10.000 ficticios y precios reales.{" "}
          {heroQuotes.length === 0 ? null : live ? "Precios en dólares (US$)." : `${landingNotice(false)}.`}
        </p>
      </section>
    </section>
  );
}

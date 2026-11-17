import Link from "next/link";
import { AnnouncementPill } from "@/components/landing/announcement-pill";
import { HeroBento } from "@/components/landing/hero-bento";
import { LandingSection } from "@/components/landing/section";
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
 *   (secundario con contorno) → /acciones.
 * Aviso: una sola línea bajo el bento con el origen de los precios y
 *   "Practica con US$10.000 ficticios". El aviso de horario vive al pie de la
 *   cinta de precios. No se borró ninguno: cada uno aparece una vez.
 *
 * T70: hero centrado y compacto; el producto va pegado debajo en un bento
 * (`hero-bento.tsx`) alimentado por las mismas cotizaciones que recibe el hero.
 * Sin gradientes, halos ni imágenes: la jerarquía la hacen la escala del H1 y
 * las tarjetas.
 */
export function Hero({ quotes, live }: { quotes: LandingQuote[]; live: boolean }) {
  // Sólo cotizaciones con precio válido: mostrar US$0,00 sería inventar un
  // dato. Si el catálogo no trae los símbolos de portada, se usan los primeros.
  const priced = quotes.filter((quote) => Number.isFinite(quote.priceUsd) && quote.priceUsd > 0);
  const heroFiltered = priced.filter((quote) => HERO_SYMBOLS.has(quote.symbol));
  const heroQuotes = (heroFiltered.length > 0 ? heroFiltered : priced).slice(0, 4);
  // Acción de la ficha y de la boleta: Apple si está, si no la primera de la lista.
  const reference = priced.find((quote) => quote.symbol === "AAPLx") ?? heroQuotes[0] ?? priced[0];

  return (
    <LandingSection titleId="hero-title" className="pt-8 pb-12 md:pt-10 md:pb-16">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        <AnnouncementPill />

        {/* `text-display` y `text-lead-lg` van en cadenas planas: `cn` (tailwind-merge)
            los descartaría junto a una clase de color. */}
        <h1 id="hero-title" className="mt-5 text-display break-words text-balance">
          Acciones de EE.UU. tokenizadas, en tu billetera
        </h1>

        <p className="mt-5 max-w-[38rem] text-pretty text-lead-lg text-fg-body">
          Compra fracciones desde US${LANDING_MIN_ORDER_USD} y opera 24/7. El token queda en tu
          propia billetera —nosotros no custodiamos tus activos—.
        </p>

        <div className="mt-7 flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/app/registro">Prueba la demo gratis</Link>
          </Button>
          <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
            <Link href="/acciones">{esCL.guest.seeStocks}</Link>
          </Button>
        </div>
      </div>

      <div className="mt-10 md:mt-12">
        <HeroBento heroQuotes={heroQuotes} reference={reference} live={live} />

        <p className="mx-auto mt-4 max-w-3xl text-center text-sm leading-relaxed text-fg-muted">
          Practica con US$10.000 ficticios.
          {heroQuotes.length === 0 ? null : ` ${landingNotice(live)}.`}
        </p>
      </div>
    </LandingSection>
  );
}

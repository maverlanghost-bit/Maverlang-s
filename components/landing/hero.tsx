import Link from "next/link";
import { HeroPhoneDemo } from "@/components/landing/hero-phone-demo";
import { LandingSection } from "@/components/landing/section";
import { Button } from "@/components/ui/button";
import { landingNotice } from "@/lib/landing/live-quotes";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";
import { HERO_SYMBOLS, type LandingQuote } from "@/lib/mocks/landing";

/**
 * Hero de la portada (T90). Dividido: copy a la izquierda y, a la derecha, el
 * teléfono con el flujo real de compra en bucle (`hero-phone-demo.tsx`).
 *
 * Copy: H1 "Acciones de EE.UU. tokenizadas, en tu billetera". Bajada con el
 * mínimo (constante del código), el 24/7 y la frase de no custodia. CTA
 * principal "Prueba la demo gratis" → /app/registro; secundario como enlace.
 * Debajo, tres datos del producto en mono (no son estadísticas de uso).
 * El origen de los precios lo dice la etiqueta del teléfono y la cinta.
 */
export function Hero({ quotes, live }: { quotes: LandingQuote[]; live: boolean }) {
  // Sólo cotizaciones con precio válido: mostrar US$0,00 sería inventar un dato.
  const priced = quotes.filter((quote) => Number.isFinite(quote.priceUsd) && quote.priceUsd > 0);
  const heroFiltered = priced.filter((quote) => HERO_SYMBOLS.has(quote.symbol));
  const heroQuotes = (heroFiltered.length > 0 ? heroFiltered : priced).slice(0, 4);
  const focus = heroQuotes.find((quote) => quote.symbol === "AAPLx") ?? heroQuotes[0];

  const facts = [
    { value: `US$${LANDING_MIN_ORDER_USD}`, label: "mínimo por orden" },
    { value: "24/7", label: "operación on-chain" },
    { value: "US$10.000", label: "ficticios para practicar" },
  ];

  return (
    <LandingSection titleId="hero-title" className="pt-6 pb-14 sm:pt-10 md:pb-20 lg:pt-12">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12">
        <div className="min-w-0">
          {/* `text-display` y `text-lead-lg` van en cadenas planas: `cn` (tailwind-merge)
              los descartaría junto a una clase de color. */}
          <h1 id="hero-title" className="max-w-[13ch] text-display break-words text-balance">
            Acciones de EE.UU. tokenizadas, en tu billetera
          </h1>

          <p className="mt-6 max-w-[34rem] text-pretty text-lead-lg text-fg-body">
            Compra fracciones desde US${LANDING_MIN_ORDER_USD} y opera 24/7. El token queda en tu propia
            billetera: nosotros no custodiamos tus activos.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/app/registro">Prueba la demo gratis</Link>
            </Button>
            <Link
              href="/acciones"
              className="inline-flex min-h-11 items-center justify-center text-[15px] font-medium text-fg underline decoration-border-strong underline-offset-[6px] transition-colors hover:decoration-fg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fg"
            >
              Ver las acciones disponibles
            </Link>
          </div>

          <dl className="mt-10 grid max-w-[34rem] grid-cols-3 divide-x divide-border border-t border-border pt-5">
            {facts.map((fact) => (
              // dt antes que dd (orden válido de la lista); la cifra se ve arriba con flex-col-reverse.
              <div key={fact.label} className="flex min-w-0 flex-col-reverse px-3 first:pl-0 sm:px-5">
                <dt className="mt-1 text-[13px] leading-snug text-fg-muted">{fact.label}</dt>
                <dd className="num text-[clamp(1.125rem,0.9rem+1vw,1.5rem)] leading-tight tracking-tight text-fg">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative min-w-0 rounded-[36px] bg-surface-1 px-4 pt-10 pb-6 sm:px-8 lg:pt-12">
          {focus ? (
            <HeroPhoneDemo quotes={heroQuotes} focus={focus} live={live} caption={`Ejemplo de la demo. ${landingNotice(live)}.`} />
          ) : (
            <p className="py-24 text-center text-sm text-fg-muted">Las cotizaciones no están disponibles en este momento.</p>
          )}
        </div>
      </div>
    </LandingSection>
  );
}

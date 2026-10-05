import type { ReactNode } from "react";
import Link from "next/link";
import { AnnouncementPill } from "@/components/landing/announcement-pill";
import { TickerRow } from "@/components/domain/ticker-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ILLUSTRATIVE_NOTICE, landingHeroQuotes } from "@/lib/mocks/landing";
import { cn } from "@/lib/cn";

/**
 * Copy en uso:
 * H1: "Acciones de EE.UU. desde $1.000"
 *   alt: "Compra Apple desde $1.000"
 *   alt: "Fracciones de acciones, en pesos"
 * Subtítulo: "Compra fracciones de Apple, NVIDIA y más con pesos chilenos."
 *   alt: "Apple, NVIDIA y el S&P 500, por fracciones, pagando en pesos."
 *   alt: "Desde Chile, con pesos, sin cuenta en un broker de EE.UU."
 * CTAs: "Crear cuenta" → /app · "Cómo funciona" → #como-funciona
 *   alt: "Abrir app" / "Ver costos"
 */

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
    <div className={cn("animate-reveal", className)} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function Hero() {
  return (
    <section className="px-5 pt-12 pb-16 md:pt-20 md:pb-24 lg:pt-24">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        <Reveal delay={0}>
          <p className="label">01 — Desde $1.000</p>
        </Reveal>
        <Reveal delay={80} className="mt-5 w-full">
          <AnnouncementPill />
        </Reveal>
        <Reveal delay={160} className="mt-6 w-full">
          <h1 className="text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Acciones de EE.UU. desde $1.000
          </h1>
        </Reveal>
        <Reveal delay={240} className="mt-4 w-full">
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-balance text-fg-body sm:text-base">
            Compra fracciones de Apple, NVIDIA y más con pesos chilenos.
          </p>
        </Reveal>
        <Reveal delay={320} className="mt-8 w-full">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="md" className="min-h-11">
              <Link href="/app">Crear cuenta</Link>
            </Button>
            <Button asChild variant="secondary" size="md" className="min-h-11">
              <Link href="/#como-funciona">Cómo funciona</Link>
            </Button>
          </div>
        </Reveal>
      </div>

      <Reveal delay={400} className="mx-auto mt-12 w-full max-w-xl md:mt-16 md:max-w-2xl">
        <Card>
          <div className="mb-2 flex items-baseline justify-between gap-3 px-2">
            <p className="label">Ejemplo</p>
            <p className="text-sm text-fg-muted">{ILLUSTRATIVE_NOTICE}</p>
          </div>
          <ul>
            {landingHeroQuotes.map((quote) => (
              <li key={quote.symbol}>
                <TickerRow
                  href={quote.href}
                  symbol={quote.symbol}
                  name={quote.name}
                  price={quote.priceUsd}
                  currency="USD"
                  change={quote.change}
                  sparkline={quote.sparkline}
                />
              </li>
            ))}
          </ul>
        </Card>
      </Reveal>
    </section>
  );
}

import type { ComponentType, ReactNode, SVGProps } from "react";
import Link from "next/link";
import { AnnouncementPill } from "@/components/landing/announcement-pill";
import { TickerRow } from "@/components/domain/ticker-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconClock, IconGlobe, IconWallet } from "@/components/ui/icons";
import { ILLUSTRATIVE_NOTICE, landingHeroQuotes } from "@/lib/mocks/landing";
import { cn } from "@/lib/cn";

/**
 * Copy en uso:
 * H1: "Acciones de EE.UU. tokenizadas, en tu billetera"
 * Subtítulo: "Compra fracciones desde $1.000. El token queda en tu billetera Solana, pagas en pesos y operas casi a cualquier hora."
 * CTAs: "Crear cuenta" → /app · "Cómo funciona" → #como-funciona
 *
 * ALTERNATIVA:
 * H1: "El token es tuyo, en tu billetera Solana"
 * Subtítulo: "Fracciones de acciones de EE.UU. desde $1.000, pagando con pesos. Mercado ampliado: opera casi a cualquier hora."
 *
 * ALTERNATIVA:
 * H1: "Fracciones de EE.UU. en Solana, pagando en pesos"
 * Subtítulo: "Tokenizadas, desde $1.000, en tu billetera. Opera casi a cualquier hora, sin cuenta en una corredora de EE.UU."
 */

const trustChips: { label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { label: "Opera casi a cualquier hora", Icon: IconClock },
  { label: "Token en tu wallet Solana", Icon: IconWallet },
  { label: "Sin cuenta en corredora de EE.UU.", Icon: IconGlobe },
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
          <p className="label">01 — Tokenizadas</p>
        </Reveal>
        <Reveal delay={80} className="mt-5 w-full">
          <AnnouncementPill />
        </Reveal>
        <Reveal delay={160} className="mt-6 w-full">
          <h1 className="text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Acciones de EE.UU. tokenizadas, en tu billetera
            {/* ALTERNATIVA: El token es tuyo, en tu billetera Solana */}
            {/* ALTERNATIVA: Fracciones de EE.UU. en Solana, pagando en pesos */}
          </h1>
        </Reveal>
        <Reveal delay={240} className="mt-4 w-full">
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-balance text-fg-body sm:text-base">
            Compra fracciones desde $1.000. El token queda en tu billetera Solana, pagas en pesos y
            operas casi a cualquier hora.
            {/* ALTERNATIVA: Fracciones de acciones de EE.UU. desde $1.000, pagando con pesos. Mercado ampliado: opera casi a cualquier hora. */}
            {/* ALTERNATIVA: Tokenizadas, desde $1.000, en tu billetera. Opera casi a cualquier hora, sin cuenta en una corredora de EE.UU. */}
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
          <ul className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-2">
            {trustChips.map((chip) => (
              <li
                key={chip.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1.5 text-sm leading-snug text-fg-body"
              >
                <chip.Icon className="size-3.5 shrink-0 text-fg-muted" />
                {chip.label}
              </li>
            ))}
          </ul>
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

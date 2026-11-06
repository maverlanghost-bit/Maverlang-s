import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { BrandMarkImage } from "@/components/app-shell/brand-image";
import { Reveal } from "@/components/landing/reveal";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { Button } from "@/components/ui/button";
import { IconChart, IconCheck, IconClock } from "@/components/ui/icons";
import { esCL } from "@/content/i18n/es-CL";

const summaryPills: { label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { label: "US$10.000 demo instantáneos", Icon: IconClock },
  { label: "Sin tarjeta de crédito", Icon: IconCheck },
  { label: "Precios en tiempo real", Icon: IconChart },
];

/**
 * Cierre de la portada: una sola tarjeta elevada sobre un halo tenue.
 * Los tres datos de la demo y la lista de espera viven dentro del mismo
 * bloque, para que el último scroll de la página no sea otro párrafo suelto.
 */
export function FinalCTA() {
  return (
    <section
      aria-labelledby="cta-final-title"
      className="relative isolate overflow-hidden bg-surface-1 px-5 py-20 md:py-28 lg:py-32"
    >
      {/* Halo decorativo: esmeralda muy tenue arriba, grafito abajo. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[image:radial-gradient(70%_55%_at_50%_0%,rgba(15,122,50,0.12),transparent_72%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[image:radial-gradient(65%_50%_at_50%_100%,rgba(10,10,10,0.06),transparent_75%)]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-border" />

      <div className="relative mx-auto w-full max-w-3xl">
        <div className="rounded-3xl border border-border bg-bg/80 p-6 shadow-float backdrop-blur-md sm:p-10 md:p-12">
          <Reveal className="flex flex-col items-center text-center">
            <span className="inline-flex items-center justify-center rounded-full border border-border bg-bg p-1.5">
              <BrandMarkImage className="size-9" />
            </span>

            <h2
              id="cta-final-title"
              className="mt-6 text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl"
            >
              Abre tu cuenta en 2 minutos
            </h2>

            <p className="mt-4 max-w-xl text-sm leading-relaxed text-balance text-fg-body sm:text-base">
              Correo, país y los textos legales. El depósito queda para cuando quieras.
            </p>

            <ul className="mt-6 flex w-full flex-wrap items-center justify-center gap-2">
              {summaryPills.map((pill) => (
                <li
                  key={pill.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1.5 text-sm leading-snug text-fg-body"
                >
                  <pill.Icon className="size-3.5 shrink-0 text-fg-muted" />
                  {pill.label}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
              <Button asChild size="lg" className="min-h-11 w-full sm:w-auto">
                <Link href="/app/registro">Prueba la demo gratis</Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="min-h-11 w-full sm:w-auto">
                <Link href="/app">{esCL.guest.seeStocks}</Link>
              </Button>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-fg-body">
              <Link
                href="#lista-de-espera"
                className="font-medium underline decoration-border underline-offset-4 hover:decoration-fg"
              >
                Avísame cuando abra la cuenta Real
              </Link>
            </p>

            <div className="mt-10 w-full border-t border-border pt-8">
              <div
                id="lista-de-espera"
                className="mx-auto w-full max-w-md scroll-mt-24 rounded-2xl border border-border bg-surface-1 p-5 text-left sm:p-6"
              >
                <p className="label">Lista de espera</p>
                <p className="mt-1 text-sm leading-relaxed text-fg-body">
                  Sólo tu correo. Te escribimos cuando abra la cuenta Real.
                </p>
                <div className="mt-4">
                  <WaitlistForm source="landing" />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

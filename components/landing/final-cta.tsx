import Link from "next/link";
import { BrandMarkImage } from "@/components/app-shell/brand-image";
import { Reveal } from "@/components/landing/reveal";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { Button } from "@/components/ui/button";
import { esCL } from "@/content/i18n/es-CL";

export function FinalCTA() {
  return (
    <section aria-labelledby="cta-final-title" className="bg-surface-1 px-5 py-20 md:py-28 lg:py-32">
      <Reveal className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <BrandMarkImage />
        <h2 id="cta-final-title" className="mt-6 text-4xl text-balance sm:text-5xl lg:text-6xl">
          Abre tu cuenta en 2 minutos
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-balance text-fg-body sm:text-base">
          Correo, país y los textos legales. El depósito queda para cuando quieras.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="min-h-11">
            <Link href="/app/registro">Prueba la demo gratis</Link>
          </Button>
          <Button asChild variant="secondary" size="lg" className="min-h-11">
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
        <div id="lista-de-espera" className="mt-8 w-full max-w-md scroll-mt-24">
          <WaitlistForm source="landing" />
        </div>
      </Reveal>
    </section>
  );
}

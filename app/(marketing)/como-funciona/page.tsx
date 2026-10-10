import type { Metadata } from "next";
import Link from "next/link";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LiveLandingPrices } from "@/components/landing/live-landing-prices";
import { LandingSection } from "@/components/landing/section";
import { Card } from "@/components/ui/card";
import { site } from "@/config/site";
import { getLandingQuotes } from "@/lib/landing/live-quotes";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description: `Practica con US$10.000 ficticios, elige la acción y el token queda en tu propia billetera, sin custodia de ${site.name}.`,
};

/** Guía dedicada: los 3 pasos con más detalle que en la portada. */
export const revalidate = 30;

export default async function ComoFuncionaPage() {
  const { quotes, live } = await getLandingQuotes();
  const symbols = quotes.map((quote) => quote.symbol);

  return (
    <main>
      <LandingSection titleId="como-funciona-title">
        <div className="max-w-2xl">
          <p className="label">Cómo funciona</p>
          <h1 id="como-funciona-title" className="mt-3 text-3xl sm:text-4xl">
            Tres pasos, en dólares (US$)
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
            Practicas con US$10.000 ficticios, eliges la acción y el token queda en tu propia
            billetera: nosotros no custodiamos tus activos. Los montos de abajo son ejemplos.
            Cuando haya cuentas reales, el depósito y su costo se muestran en ese paso.
          </p>
        </div>
      </LandingSection>
      <LiveLandingPrices symbols={symbols} live={live} initial={quotes}>
        <HowItWorks quotes={quotes} live={live} />
      </LiveLandingPrices>
      <LandingSection titleId="como-funciona-notas">
        <div className="max-w-3xl">
          <h2 id="como-funciona-notas" className="text-xl sm:text-2xl">
            Antes de partir
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <h3 className="text-base">El depósito</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-body">
                La demo no pide dinero real: practicas con US$10.000 ficticios. Cuando haya
                cuentas reales, el monto, el método y el costo del proveedor se ven en ese paso.
              </p>
            </Card>
            <Card className="p-5">
              <h3 className="text-base">La compra</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-body">
                Ves el precio en dólares (US$) y el desglose completo —comisión, red e impacto—
                antes de aceptar la orden.
              </p>
            </Card>
            <Card className="p-5">
              <h3 className="text-base">La custodia</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-body">
                El token es tuyo y queda en tu propia billetera. Tenerlo no te hace accionista ni te
                da voto.
              </p>
            </Card>
            <Card className="p-5">
              <h3 className="text-base">El horario</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-body">
                Se opera 24/7. Fuera del horario regular de la bolsa de EE.UU. el precio puede variar
                más.
              </p>
            </Card>
          </div>
          <p className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
            <Link
              href="/app"
              className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
            >
              Ver acciones
            </Link>
            <Link
              href="/costos"
              className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
            >
              Ver costos
            </Link>
            <Link
              href="/ayuda"
              className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
            >
              Ir al centro de ayuda
            </Link>
          </p>
        </div>
      </LandingSection>
    </main>
  );
}

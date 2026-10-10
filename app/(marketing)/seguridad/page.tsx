import type { Metadata } from "next";
import Link from "next/link";
import { SecuritySection } from "@/components/landing/security-section";
import { LandingSection } from "@/components/landing/section";
import { Card } from "@/components/ui/card";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Seguridad",
  description: `Tus activos en tu propia billetera, sin custodia de ${site.name}. Qué tienes, qué no, y qué riesgos existen.`,
};

/** Página dedicada de seguridad: las tarjetas de la portada más el marco completo. */
export default function SeguridadPage() {
  return (
    <main>
      <LandingSection titleId="seguridad-page-title">
        <div className="max-w-2xl">
          <p className="label">Seguridad</p>
          <h1 id="seguridad-page-title" className="mt-3 text-3xl sm:text-4xl">
            Qué tienes y qué no
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
            {site.name} no es una corredora de EE.UU. El token es tuyo y queda en tu propia
            billetera, sin custodia de nuestra parte. Sigue el precio de la acción.
          </p>
        </div>
      </LandingSection>
      <SecuritySection />
      <LandingSection titleId="seguridad-demo">
        <div className="max-w-3xl">
          <h2 id="seguridad-demo" className="text-xl sm:text-2xl">
            La demo no es dinero real
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
            La demo parte con US$10.000 ficticios para practicar, con precios reales. En esta demo
            no se cobra dinero real.
          </p>
          <p className="mt-6">
            <Link
              href="/app/registro"
              className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
            >
              Probar la demo
            </Link>
          </p>
        </div>
      </LandingSection>
      <LandingSection titleId="seguridad-practicas">
        <div className="max-w-3xl">
          <h2 id="seguridad-practicas" className="text-xl sm:text-2xl">
            Buenas prácticas
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <h3 className="text-base">Cuida tu acceso</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-body">
                Quien controle la cuenta controla los activos. No compartas tu acceso y cierra la
                sesión en equipos ajenos.
              </p>
            </Card>
            <Card className="p-5">
              <h3 className="text-base">Revisa antes de confirmar</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-body">
                Mira el precio en tu moneda y el desglose completo —comisión, red e impacto— antes
                de aceptar cada orden.
              </p>
            </Card>
            <Card className="p-5">
              <h3 className="text-base">Practica primero</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-body">
                Usa la demo con saldo ficticio antes de operar con dinero real.
              </p>
            </Card>
            <Card className="p-5">
              <h3 className="text-base">Lee los riesgos</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-body">
                El token sigue el precio de la acción y puedes perder lo que inviertas. La
                divulgación completa está en borrador.
              </p>
            </Card>
          </div>
        </div>
      </LandingSection>
      <LandingSection titleId="seguridad-marco">
        <div className="max-w-3xl">
          <h2 id="seguridad-marco" className="text-xl sm:text-2xl">
            El marco completo
          </h2>
          <ul className="mt-6 space-y-4 text-sm leading-relaxed text-fg-body sm:text-base">
            <li>
              <strong className="font-medium text-fg">Tus activos.</strong> El token queda en tu
              propia billetera. Nosotros no lo custodiamos.
            </li>
            <li>
              <strong className="font-medium text-fg">Lo que no te da.</strong> No te convierte en
              accionista registrado ni te da derecho a voto.
            </li>
            <li>
              <strong className="font-medium text-fg">El emisor.</strong> Las acciones tokenizadas
              del catálogo las emite Backed (xStocks) y puede restringir el activo.
            </li>
            <li>
              <strong className="font-medium text-fg">El riesgo.</strong> Puedes perder lo que
              inviertas. Fuera del horario regular de la bolsa de EE.UU. el precio puede variar más.
            </li>
          </ul>
          <p className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
            <Link
              href="/legal/riesgos"
              className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
            >
              Leer los riesgos
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

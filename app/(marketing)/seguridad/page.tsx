import type { Metadata } from "next";
import Link from "next/link";
import { SecuritySection } from "@/components/landing/security-section";
import { LandingSection } from "@/components/landing/section";
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

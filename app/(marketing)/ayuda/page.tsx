import type { Metadata } from "next";
import Link from "next/link";
import { FaqList } from "@/components/landing/faq";
import { LandingSection } from "@/components/landing/section";
import { Card } from "@/components/ui/card";
import { site } from "@/config/site";
import { getFaq } from "@/lib/content/faq";

export const metadata: Metadata = {
  title: "Ayuda",
  description: `Centro de ayuda de ${site.name}: qué es la demo, cómo registrarte, cómo comprar y vender, dónde ver tu cartera, qué es la autocustodia y cómo recuperar tu contraseña.`,
};

const GUIDES = [
  {
    href: "/como-funciona",
    title: "Cómo funciona",
    body: "Practica con US$10.000 ficticios, elige la acción y recibe el token en tu propia billetera.",
  },
  {
    href: "/costos",
    title: "Costos",
    body: "Comisión 0% en el lanzamiento, red, diferencia de precio y proveedor.",
  },
  {
    href: "/seguridad",
    title: "Seguridad",
    body: "Tus activos en tu propia billetera, qué tienes y qué no.",
  },
  {
    href: "/legal/comisiones",
    title: "Comisiones",
    body: "La tabla de costos, en borrador sujeto a revisión legal.",
  },
  {
    href: "/legal/riesgos",
    title: "Riesgos",
    body: "Lo que puedes perder y los límites del token, en borrador.",
  },
  {
    href: "/legal/terminos",
    title: "Términos y privacidad",
    body: "Las reglas de la cuenta y el tratamiento de tus datos, en borrador.",
  },
] as const;

/** Centro de ayuda: guías dedicadas arriba, preguntas frecuentes abajo. */
export default function AyudaPage() {
  const faq = getFaq(site.name);
  const partir = faq.filter((entry) =>
    ["demo", "registro", "contrasena", "que-es"].includes(entry.id),
  );
  const operar = faq.filter((entry) =>
    ["comprar-vender", "cartera", "horario", "deposito"].includes(entry.id),
  );
  const seguridad = faq.filter(
    (entry) => ![...partir, ...operar].some((item) => item.id === entry.id),
  );
  return (
    <main>
      <LandingSection titleId="ayuda-title">
        <div className="max-w-2xl">
          <p className="label">Ayuda</p>
          <h1 id="ayuda-title" className="mt-3 text-3xl sm:text-4xl">
            Centro de ayuda
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
            Guías por tema y respuestas cortas. Si partes de cero, empieza por
            “Para partir”. Términos, privacidad, riesgos y comisiones siguen en
            borrador.
          </p>
        </div>
        <ul className="mt-10 grid max-w-3xl gap-4 sm:grid-cols-2 md:mt-14">
          {GUIDES.map((guide) => (
            <li key={guide.href + guide.title}>
              <Card className="h-full p-5">
                <Link href={guide.href} className="block min-h-11">
                  <span className="text-base font-medium text-fg">{guide.title}</span>
                  <span className="mt-2 block text-sm leading-relaxed text-fg-body">
                    {guide.body}
                  </span>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
        <div className="mt-10 max-w-3xl space-y-10 md:mt-14">
          <section aria-labelledby="ayuda-partir">
            <h2 id="ayuda-partir" className="text-xl sm:text-2xl">
              Para partir
            </h2>
            <div className="mt-6">
              <FaqList entries={partir} type="multiple" />
            </div>
          </section>
          <section aria-labelledby="ayuda-operar">
            <h2 id="ayuda-operar" className="text-xl sm:text-2xl">
              Para operar
            </h2>
            <div className="mt-6">
              <FaqList entries={operar} type="multiple" />
            </div>
          </section>
          <section aria-labelledby="ayuda-seguridad">
            <h2 id="ayuda-seguridad" className="text-xl sm:text-2xl">
              Seguridad y costos
            </h2>
            <div className="mt-6">
              <FaqList entries={seguridad} type="multiple" />
            </div>
          </section>
        </div>
      </LandingSection>
    </main>
  );
}

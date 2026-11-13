import Link from "next/link";
import { LandingSection } from "@/components/landing/section";
import { DisclosureList, type DisclosureItem } from "@/components/ui/disclosure-list";
import { site } from "@/config/site";
import { getFaq, type FaqEntry, type FaqPart } from "@/lib/content/faq";
import { faqPageJsonLd, JsonLd } from "@/lib/seo/jsonld";
import { brandShort, pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: `Preguntas frecuentes de acciones tokenizadas | ${brandShort()}`,
  description:
    "Respuestas sobre cómo comprar acciones tokenizadas, crear tu cuenta, operar con USDC, revisar tu cartera, la autocustodia y los costos.",
  path: "/ayuda",
  absolute: true,
});

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

const JUMP_LINKS = [
  { href: "#ayuda-partir", label: "Para partir" },
  { href: "#ayuda-operar", label: "Para operar" },
  { href: "#ayuda-seguridad", label: "Seguridad y costos" },
] as const;

const textLinkClass =
  "inline-flex min-h-11 items-center text-sm font-medium text-fg-body underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-fg hover:decoration-fg motion-reduce:transition-none";

// Enlace dentro de una respuesta: va en línea con la prosa.
const inlineLinkClass =
  "font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg";

function FaqParts({ parts }: { parts: FaqPart[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "link") {
          return (
            <Link key={index} href={part.href} className={inlineLinkClass}>
              {part.label}
            </Link>
          );
        }
        /* Marca interna de borrador ([VERIFICAR], [REVISIÓN ABOGADO]): no se
           publica en la FAQ. El texto legal de la respuesta se mantiene completo. */
        if (part.kind === "marker") return null;
        return <span key={index}>{part.value}</span>;
      })}
    </>
  );
}

/** Las preguntas se despliegan con `<details>`: sin JS, varias abiertas a la vez. */
function toDisclosureItems(entries: FaqEntry[]): DisclosureItem[] {
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.question,
    content: (
      <div className="max-w-[68ch] space-y-3 text-[0.9375rem] leading-relaxed sm:text-base">
        {entry.paragraphs.map((paragraph, index) => (
          <p key={index}>
            <FaqParts parts={paragraph} />
          </p>
        ))}
      </div>
    ),
  }));
}

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
  const faqLd = faqPageJsonLd(faq);

  return (
    <>
      <JsonLd data={faqLd} />
      <LandingSection titleId="ayuda-title" density="compact">
        <div className="max-w-3xl">
          <p className="label">Ayuda</p>
          <h1 id="ayuda-title" className="mt-3 text-3xl sm:text-4xl">
            Centro de ayuda
          </h1>
          <p className="mt-4 max-w-[62ch] text-lead text-fg-body">
            Guías por tema y respuestas cortas. Si partes de cero, empieza por “Para partir”. Términos,
            privacidad, riesgos y comisiones siguen en borrador.
          </p>
        </div>

        <nav aria-label="Secciones de la página" className="mt-8 max-w-3xl md:mt-10">
          <p className="eyebrow">En esta página</p>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-0.5">
            {JUMP_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={textLinkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section aria-labelledby="ayuda-guias" className="mt-12 max-w-3xl md:mt-16">
          <h2 id="ayuda-guias" className="text-2xl sm:text-3xl">
            Guías por tema
          </h2>
          <ul className="mt-5 divide-y divide-border border-y border-border">
            {GUIDES.map((guide) => (
              <li key={guide.href + guide.title}>
                <Link
                  href={guide.href}
                  className="group flex min-h-11 items-start gap-4 py-4 transition-colors duration-150 motion-reduce:transition-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-snug font-medium text-fg sm:text-base">
                      {guide.title}
                    </span>
                    <span className="mt-1 block text-[0.9375rem] leading-relaxed text-fg-body">
                      {guide.body}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-sm text-fg-muted transition-colors duration-150 group-hover:text-fg motion-reduce:transition-none"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-12 max-w-3xl space-y-10 md:mt-16 md:space-y-12">
          {[
            { id: "ayuda-partir", title: "Para partir", entries: partir },
            { id: "ayuda-operar", title: "Para operar", entries: operar },
            { id: "ayuda-seguridad", title: "Seguridad y costos", entries: seguridad },
          ].map((group) => (
            <section key={group.id} aria-labelledby={group.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id={group.id} className="text-2xl sm:text-3xl">
                  {group.title}
                </h2>
                <p className="text-[13px] text-fg-muted tabular-nums">
                  {group.entries.length} {group.entries.length === 1 ? "pregunta" : "preguntas"}
                </p>
              </div>
              <DisclosureList
                items={toDisclosureItems(group.entries)}
                className="mt-4"
                summaryClassName="text-[15px] leading-snug sm:text-base"
              />
            </section>
          ))}
        </div>
      </LandingSection>
    </>
  );
}

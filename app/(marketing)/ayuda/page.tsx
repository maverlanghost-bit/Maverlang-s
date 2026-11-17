import Link from "next/link";
import { PageHero } from "@/components/landing/page-hero";
import { PageLinkCards } from "@/components/landing/page-link-cards";
import { LandingSection, SectionHeader } from "@/components/landing/section";
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

function questionCount(count: number): string {
  return `${count} ${count === 1 ? "pregunta" : "preguntas"}`;
}

/** Centro de ayuda: temas arriba, guías por tema y preguntas frecuentes abajo. */
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

  const groups = [
    { id: "ayuda-partir", title: "Para partir", entries: partir, muted: false },
    { id: "ayuda-operar", title: "Para operar", entries: operar, muted: true },
    { id: "ayuda-seguridad", title: "Seguridad y costos", entries: seguridad, muted: false },
  ];

  return (
    <>
      <JsonLd data={faqLd} />

      <PageHero
        titleId="ayuda-title"
        eyebrow="Ayuda"
        title="Centro de ayuda"
        aside={
          <nav aria-label="Temas de ayuda">
            <ul className="grid list-none gap-3">
              {groups.map((group) => (
                <li key={group.id}>
                  <a
                    href={`#${group.id}`}
                    className="group flex min-h-11 items-center justify-between gap-4 rounded-bento border border-border bg-bg p-5 transition-colors hover:border-border-strong hover:bg-surface-1 motion-reduce:transition-none md:p-6"
                  >
                    <span className="min-w-0">
                      <span className="block text-lg leading-snug font-semibold tracking-tight text-fg">
                        {group.title}
                      </span>
                      <span className="num mt-1 block text-[13px] leading-snug text-fg-muted">
                        {questionCount(group.entries.length)}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-lg leading-snug text-fg-muted transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-fg motion-reduce:transition-none"
                    >
                      →
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        }
      >
        Guías por tema y respuestas cortas. Si partes de cero, empieza por “Para partir”. Términos,
        privacidad, riesgos y comisiones siguen en borrador.
      </PageHero>

      <LandingSection titleId="ayuda-guias" tone="muted" density="compact">
        <SectionHeader id="ayuda-guias" align="split" title="Guías por tema" />
        <PageLinkCards className="mt-8 md:mt-10" links={GUIDES} />
      </LandingSection>

      {groups.map((group) => (
        <LandingSection
          key={group.id}
          titleId={group.id}
          tone={group.muted ? "muted" : "default"}
          density="compact"
        >
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-4">
              <h2 id={group.id} className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                {group.title}
              </h2>
              <p className="num mt-2 text-[13px] text-fg-muted">
                {questionCount(group.entries.length)}
              </p>
            </div>
            <div className="min-w-0 lg:col-span-8">
              <DisclosureList
                items={toDisclosureItems(group.entries)}
                summaryClassName="text-[15px] leading-snug sm:text-base"
              />
            </div>
          </div>
        </LandingSection>
      ))}
    </>
  );
}

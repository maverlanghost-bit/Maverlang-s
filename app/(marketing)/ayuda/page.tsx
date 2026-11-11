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

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: "size-4",
} as const;

/** Ícono por guía: reloj, recibo, escudo, porcentaje, advertencia, documento. */
function GuideIcon({ href }: { href: (typeof GUIDES)[number]["href"] }) {
  if (href === "/como-funciona") {
    return (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l2.9 1.9" />
      </svg>
    );
  }
  if (href === "/costos") {
    return (
      <svg {...ICON_PROPS}>
        <path d="M7 3.5h10a1 1 0 0 1 1 1v16l-3-1.9-3 1.9-3-1.9-3 1.9v-16a1 1 0 0 1 1-1Z" />
        <path d="M9.5 8h5M9.5 11.5h5M9.5 15h3" />
      </svg>
    );
  }
  if (href === "/seguridad") {
    return (
      <svg {...ICON_PROPS}>
        <path d="M12 3.5 5 6.3v5.1c0 4.3 2.9 7.4 7 9.1 4.1-1.7 7-4.8 7-9.1V6.3Z" />
        <path d="m9.2 12 2 2 3.6-3.9" />
      </svg>
    );
  }
  if (href === "/legal/comisiones") {
    return (
      <svg {...ICON_PROPS}>
        <path d="M7.2 16.8 16.8 7.2" />
        <circle cx="8.4" cy="8.4" r="2.1" />
        <circle cx="15.6" cy="15.6" r="2.1" />
      </svg>
    );
  }
  if (href === "/legal/riesgos") {
    return (
      <svg {...ICON_PROPS}>
        <path d="M12 4.4 3.8 18.4a1.1 1.1 0 0 0 1 1.7h14.4a1.1 1.1 0 0 0 1-1.7Z" />
        <path d="M12 9.8v3.9M12 16.9h.01" />
      </svg>
    );
  }
  return (
    <svg {...ICON_PROPS}>
      <path d="M7 3.5h6.6L18 7.9v12.2a.9.9 0 0 1-.9.9H7a.9.9 0 0 1-.9-.9V4.4a.9.9 0 0 1 .9-.9Z" />
      <path d="M13.4 3.6v4.4h4.4" />
      <path d="M9.6 12.4h5M9.6 15.8h5" />
    </svg>
  );
}

const JUMP_LINKS = [
  { href: "#ayuda-partir", label: "Para partir" },
  { href: "#ayuda-operar", label: "Para operar" },
  { href: "#ayuda-seguridad", label: "Seguridad y costos" },
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
      <div className="space-y-3">
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

        <nav aria-label="Secciones de la página" className="mt-8 max-w-4xl md:mt-10">
          <p className="eyebrow">En esta página</p>
          <ul className="mt-2 flex flex-wrap gap-x-6">
            {JUMP_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-fg-body underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-fg hover:decoration-fg motion-reduce:transition-none"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section aria-labelledby="ayuda-guias" className="mt-10 max-w-4xl md:mt-14">
          <h2 id="ayuda-guias" className="scroll-mt-24 text-2xl sm:text-3xl">
            Guías por tema
          </h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {GUIDES.map((guide) => (
              <li key={guide.href + guide.title}>
                <Link
                  href={guide.href}
                  className="group flex h-full min-h-11 flex-col rounded-2xl bg-surface-1 p-5 shadow-card transition-colors duration-150 hover:bg-surface-2 motion-reduce:transition-none"
                >
                  <span className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-bg text-fg-body transition-colors duration-150 group-hover:text-fg motion-reduce:transition-none">
                      <GuideIcon href={guide.href} />
                    </span>
                    <span className="mt-1.5 text-base leading-snug font-medium text-fg">
                      {guide.title}
                    </span>
                    <span
                      aria-hidden="true"
                      className="mt-0.5 ml-auto grid size-7 shrink-0 place-items-center rounded-full border border-border bg-bg font-mono text-sm text-fg-muted transition duration-150 group-hover:border-border-strong group-hover:text-fg motion-safe:group-hover:translate-x-0.5 motion-reduce:transition-none"
                    >
                      →
                    </span>
                  </span>
                  <span className="mt-3 block text-sm leading-relaxed text-fg-body">
                    {guide.body}
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
                <h2 id={group.id} className="scroll-mt-24 text-2xl sm:text-3xl">
                  {group.title}
                </h2>
                <p className="text-xs text-fg-muted tabular-nums">
                  {group.entries.length} preguntas
                </p>
              </div>
              <DisclosureList items={toDisclosureItems(group.entries)} className="mt-4" />
            </section>
          ))}
        </div>
      </LandingSection>
    </>
  );
}

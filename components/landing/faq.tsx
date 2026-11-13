import Link from "next/link";
import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { DisclosureList, type DisclosureItem } from "@/components/ui/disclosure-list";
import { site } from "@/config/site";
import { getFaq, type FaqEntry, type FaqPart } from "@/lib/content/faq";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

// Enlace dentro de una respuesta: va en línea con la prosa (un `inline-flex`
// de 44 px abriría la línea del párrafo).
const linkClass =
  "font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg";

// Enlace suelto fuera de la prosa: sí necesita 44 px táctiles.
const actionLinkClass =
  "inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg";

function FaqParts({ parts }: { parts: FaqPart[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "link") {
          return (
            <Link key={index} href={part.href} className={linkClass}>
              {part.label}
            </Link>
          );
        }
        if (part.kind === "marker") {
          // Marca interna de borrador ([VERIFICAR], [REVISIÓN ABOGADO]): no se
          // publica. El texto legal de la respuesta se mantiene completo.
          return null;
        }
        return <span key={index}>{part.value}</span>;
      })}
    </>
  );
}

/** Las respuestas se despliegan con `<details>`: sin JavaScript, varias abiertas. */
function toDisclosureItems(entries: FaqEntry[]): DisclosureItem[] {
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.question,
    content: (
      <div className="space-y-3 pr-6">
        {entry.paragraphs.map((paragraph, index) => (
          <p key={index}>
            <FaqParts parts={paragraph} />
          </p>
        ))}
      </div>
    ),
  }));
}

/**
 * Acordeón nativo: la misma lista `<details>` del centro de ayuda
 * (`DisclosureList`), sin JavaScript. La respuesta se mantiene íntegra en el
 * DOM y el navegador resuelve apertura y foco.
 */
function FaqDisclosure({ entries }: { entries: FaqEntry[] }) {
  return (
    <DisclosureList
      items={toDisclosureItems(entries)}
      summaryClassName="text-[15px] leading-snug sm:text-base"
    />
  );
}

export function FaqSection() {
  const entries = getFaq(site.name).filter((entry) => entry.home);

  return (
    <LandingSection id="preguntas" titleId="preguntas-title">
      <Reveal>
        <SectionIntro id="preguntas-title" title="Antes de abrir la cuenta">
          Siete respuestas cortas. El detalle legal sigue en borrador.
        </SectionIntro>
      </Reveal>
      <Reveal delay={REVEAL_STAGGER_MS} className="mt-10 max-w-3xl md:mt-14">
        <FaqDisclosure entries={entries} />
        <p className="mt-4">
          <Link href="/ayuda" className={actionLinkClass}>
            Ver todas las preguntas
          </Link>
        </p>
      </Reveal>
    </LandingSection>
  );
}

export function FaqList({
  entries,
}: {
  entries: FaqEntry[];
  type?: "single" | "multiple";
}) {
  return <FaqDisclosure entries={entries} />;
}

import Link from "next/link";
import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { IconChevron } from "@/components/ui/icons";
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

/**
 * Acordeón nativo: un `<details>` por pregunta, sin JavaScript. La respuesta
 * se mantiene íntegra en el DOM y el navegador resuelve apertura y foco.
 */
function FaqDisclosure({ entries }: { entries: FaqEntry[] }) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {entries.map((entry) => (
        <details key={entry.id} className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-start justify-between gap-6 py-4 text-left text-[15px] font-medium leading-snug text-fg sm:text-base [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">{entry.question}</span>
            <IconChevron className="disclosure-chevron mt-0.5 size-4 shrink-0 text-fg-muted transition-transform duration-200 motion-reduce:transition-none" />
          </summary>
          <div className="space-y-3 pb-5 pr-6 text-sm leading-relaxed text-fg-body">
            {entry.paragraphs.map((paragraph, index) => (
              <p key={index}>
                <FaqParts parts={paragraph} />
              </p>
            ))}
          </div>
        </details>
      ))}
    </div>
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

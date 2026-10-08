import Link from "next/link";
import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { Accordion, type AccordionItem } from "@/components/ui/accordion";
import { site } from "@/config/site";
import { getFaq, type FaqEntry, type FaqPart } from "@/lib/content/faq";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

const linkClass =
  "inline-flex min-h-11 items-center font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg";

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
          return (
            <span key={index} className="font-medium text-warn">
              {part.value}
            </span>
          );
        }
        return <span key={index}>{part.value}</span>;
      })}
    </>
  );
}

function toAccordionItems(entries: FaqEntry[]): AccordionItem[] {
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

export function FaqSection() {
  const items = toAccordionItems(getFaq(site.name).filter((entry) => entry.home));

  return (
    <LandingSection id="preguntas" titleId="preguntas-title">
      <Reveal>
        <SectionIntro id="preguntas-title" title="Antes de abrir la cuenta">
          Siete respuestas cortas. El detalle legal sigue en borrador.
        </SectionIntro>
      </Reveal>
      <Reveal delay={REVEAL_STAGGER_MS} className="mt-10 max-w-3xl md:mt-14">
        <Accordion items={items} />
        <p className="mt-6">
          <Link href="/ayuda" className={linkClass}>
            Ver todas las preguntas
          </Link>
        </p>
      </Reveal>
    </LandingSection>
  );
}

export function FaqList({ entries, type = "single" }: { entries: FaqEntry[]; type?: "single" | "multiple" }) {
  return <Accordion items={toAccordionItems(entries)} type={type} />;
}

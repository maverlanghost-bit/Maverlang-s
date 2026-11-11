import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuideReadMarker } from "@/components/domain/guide-read-marker";
import { LandingSection } from "@/components/landing/section";
import { Button } from "@/components/ui/button";
import { DisclosureList, type DisclosureItem } from "@/components/ui/disclosure-list";
import { guideBySlug, visibleGuides, type Guide } from "@/lib/content/guias";
import { articleJsonLd, breadcrumbJsonLd, JsonLd, simpleFaqJsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";

export const revalidate = 3600;
/** Un slug desconocido (o una guía con revisión legal pendiente) cae en `notFound()`. */
export const dynamicParams = true;

/** Ancla estable por sección: sin tildes, con el índice para evitar colisiones. */
function sectionId(heading: string, index: number): string {
  const base = heading
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base ? `${base}-${index + 1}` : `seccion-${index + 1}`;
}

/** Fecha de la guía en es-CL, sin corrimiento por zona horaria. */
function formatGuideDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function generateStaticParams() {
  return visibleGuides().map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) {
    return pageMetadata({
      title: "Guía no encontrada",
      description: "La guía no existe o cambió de dirección.",
      path: `/guias/${slug}`,
      index: false,
      follow: false,
    });
  }
  return pageMetadata({
    title: guide.title,
    description: guide.description,
    path: `/guias/${guide.slug}`,
    absolute: true,
  });
}

const chipClass =
  "inline-flex items-center rounded-full border border-border bg-surface-1 px-2.5 py-1 text-xs leading-none font-medium text-fg-muted";

const secondaryLinkClass =
  "inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg";

/** La FAQ de la guía usa el mismo `<details>` sin JS que /ayuda. */
function faqItems(faq: NonNullable<Guide["faq"]>): DisclosureItem[] {
  return faq.map((entry) => ({
    id: entry.question,
    title: entry.question,
    content: <p>{entry.answer}</p>,
  }));
}

export default async function GuiaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) notFound();

  const sections = guide.sections.map((section, index) => ({
    ...section,
    id: sectionId(section.heading, index),
  }));

  const related = [...new Set(guide.related ?? [])]
    .filter((relatedSlug) => relatedSlug !== guide.slug)
    .map((relatedSlug) => guideBySlug(relatedSlug))
    .filter((item): item is Guide => item !== null);

  const crumbs = [
    { name: "Inicio", path: "/" },
    { name: "Guías", path: "/guias" },
    { name: guide.title, path: `/guias/${guide.slug}` },
  ];

  const faq = guide.faq ?? [];
  const sources = guide.sources ?? [];

  return (
    <LandingSection titleId="guia-title" density="compact">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <JsonLd
        data={articleJsonLd({
          title: guide.title,
          description: guide.description,
          path: `/guias/${guide.slug}`,
          datePublished: guide.updatedAt,
          dateModified: guide.updatedAt,
        })}
      />
      {faq.length > 0 ? <JsonLd data={simpleFaqJsonLd(faq)} /> : null}
      <GuideReadMarker slug={guide.slug} />

      <article>
        <nav aria-label="Migas" className="text-sm text-fg-muted">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <li>
              <Link href="/" className="underline decoration-border underline-offset-4 hover:decoration-fg">
                Inicio
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href="/guias"
                className="underline decoration-border underline-offset-4 hover:decoration-fg"
              >
                Guías
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-fg">
              {guide.title}
            </li>
          </ol>
        </nav>

        <header className="mt-8 max-w-3xl border-b border-border pb-8">
          <p className="label">Guía</p>
          <h1 id="guia-title" className="mt-2 text-3xl sm:text-4xl">
            {guide.h1}
          </h1>
          <p className="mt-4 max-w-[62ch] text-lead text-fg-body">{guide.description}</p>
          <ul className="mt-5 flex flex-wrap items-center gap-2">
            <li>
              <span className={chipClass}>{guide.readingMinutes} min de lectura</span>
            </li>
            <li>
              <span className={chipClass}>Actualizada el {formatGuideDate(guide.updatedAt)}</span>
            </li>
            <li>
              <span className={chipClass}>Contenido educativo</span>
            </li>
          </ul>
        </header>

        <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-12">
          <aside className="mb-8 lg:order-2 lg:sticky lg:top-24 lg:mb-0">
            <nav
              aria-label="En esta guía"
              className="rounded-3xl bg-surface-1 p-5 shadow-card sm:p-6"
            >
              <p className="eyebrow">En esta guía</p>
              <ol className="mt-2 space-y-0.5 text-sm">
                {sections.map((section, index) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="flex min-h-11 items-start gap-2 py-1.5 leading-snug text-fg-body underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:text-fg hover:decoration-fg motion-reduce:transition-none"
                    >
                      <span aria-hidden="true" className="font-mono text-xs tabular-nums text-fg-muted">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{section.heading}</span>
                    </a>
                  </li>
                ))}
                {faq.length > 0 ? (
                  <li>
                    <a
                      href="#guia-faq"
                      className="flex min-h-11 items-center gap-2 py-1.5 leading-snug text-fg-body underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:text-fg hover:decoration-fg motion-reduce:transition-none"
                    >
                      <span aria-hidden="true" className="font-mono text-xs tabular-nums text-fg-muted">
                        ?
                      </span>
                      <span>Preguntas frecuentes</span>
                    </a>
                  </li>
                ) : null}
                {sources.length > 0 ? (
                  <li>
                    <a
                      href="#guia-fuentes"
                      className="flex min-h-11 items-center gap-2 py-1.5 leading-snug text-fg-body underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:text-fg hover:decoration-fg motion-reduce:transition-none"
                    >
                      <span aria-hidden="true" className="font-mono text-xs tabular-nums text-fg-muted">
                        §
                      </span>
                      <span>Fuentes</span>
                    </a>
                  </li>
                ) : null}
              </ol>
            </nav>
          </aside>

          <div className="min-w-0 max-w-2xl lg:order-1">
            <div className="space-y-8">
              {sections.map((section) => (
                <section
                  key={section.id}
                  aria-labelledby={section.id}
                  className="scroll-mt-24 border-t border-border pt-8 first:border-t-0 first:pt-0"
                >
                  <h2 id={section.id} className="text-xl sm:text-2xl">
                    {section.heading}
                  </h2>
                  <div className="mt-3 space-y-5 text-[1.0625rem] leading-7 text-fg-body">
                    {section.paragraphs.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                    {section.bullets && section.bullets.length > 0 ? (
                      <ul className="list-disc space-y-2 pl-5">
                        {section.bullets.map((bullet, index) => (
                          <li key={index}>{bullet}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>

            {faq.length > 0 ? (
              <section id="guia-faq" aria-labelledby="guia-faq-title" className="mt-10 scroll-mt-24">
                <h2 id="guia-faq-title" className="text-xl sm:text-2xl">
                  Preguntas frecuentes
                </h2>
                <DisclosureList items={faqItems(faq)} className="mt-4" />
              </section>
            ) : null}

            {sources.length > 0 ? (
              <section id="guia-fuentes" aria-labelledby="guia-fuentes-title" className="mt-10 scroll-mt-24">
                <h2 id="guia-fuentes-title" className="text-xl sm:text-2xl">
                  Fuentes
                </h2>
                <ul className="mt-3 space-y-1 text-sm leading-relaxed">
                  {sources.map((source) => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="nofollow noopener"
                        className="inline-flex min-h-11 items-center text-fg-body underline decoration-border underline-offset-4 hover:text-fg hover:decoration-fg"
                      >
                        {source.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {related.length > 0 ? (
              <section id="guia-relacionadas" aria-labelledby="guia-relacionadas-title" className="mt-10">
                <h2 id="guia-relacionadas-title" className="text-xl sm:text-2xl">
                  Sigue leyendo
                </h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {related.map((item) => (
                    <li key={item.slug} className="h-full">
                      <Link
                        href={`/guias/${item.slug}`}
                        className="group flex h-full min-h-11 flex-col rounded-2xl bg-surface-1 p-5 shadow-card transition-colors duration-150 hover:bg-surface-2 motion-reduce:transition-none"
                      >
                        <span className="text-base leading-snug font-medium text-fg">{item.title}</span>
                        <span className="mt-2 block text-sm leading-relaxed text-fg-body">{item.description}</span>
                        <span className="mt-auto pt-3 text-xs leading-none font-medium text-fg-muted">
                          {item.readingMinutes} min de lectura
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <aside className="mt-10 rounded-3xl bg-surface-1 p-6 shadow-card md:p-8">
              <h2 className="text-base font-medium text-fg">Del texto al catálogo</h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-body">
                Cada ficha muestra el precio del token, los datos de la empresa tomados de la SEC y los riesgos
                de operar fuera del horario regular de la bolsa de EE.UU. Esta guía es educativa: no es asesoría
                financiera ni una recomendación de compra o venta.
              </p>
              <p className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Button asChild>
                  <Link href="/acciones">Ver acciones</Link>
                </Button>
                <Link href="/guias" className={secondaryLinkClass}>
                  Todas las guías
                </Link>
              </p>
            </aside>
          </div>
        </div>
      </article>
    </LandingSection>
  );
}

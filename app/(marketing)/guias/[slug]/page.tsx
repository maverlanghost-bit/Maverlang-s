import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuideReadMarker } from "@/components/domain/guide-read-marker";
import { LandingSection } from "@/components/landing/section";
import { Button } from "@/components/ui/button";
import { DisclosureList, type DisclosureItem } from "@/components/ui/disclosure-list";
import { IconChevron } from "@/components/ui/icons";
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

/** Rótulo mono del índice: 13 px, el mínimo de la escala editorial. */
const eyebrowMono =
  "font-mono text-[13px] leading-none font-medium uppercase tracking-[0.045em] text-fg-muted";

const textLinkClass =
  "inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg";

type TocItem = { id: string; label: string; marker: string };

/** Misma fila de índice (44 px, número mono) en el pliegue de móvil y en el aside fijo. */
function GuideIndex({ items }: { items: TocItem[] }) {
  return (
    <ol className="mt-2 text-sm">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            className="flex min-h-11 items-start gap-2.5 py-1.5 leading-snug text-fg-body underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:text-fg hover:decoration-fg motion-reduce:transition-none"
          >
            <span aria-hidden="true" className="mt-px font-mono text-[13px] tabular-nums text-fg-muted">
              {item.marker}
            </span>
            <span className="min-w-0">{item.label}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

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

  /* El índice ya existía: se conserva con las mismas entradas y sus marcas. */
  const toc: TocItem[] = [
    ...sections.map((section, index) => ({
      id: section.id,
      label: section.heading,
      marker: String(index + 1).padStart(2, "0"),
    })),
    ...(faq.length > 0
      ? [{ id: "guia-faq", label: "Preguntas frecuentes", marker: "?" }]
      : []),
    ...(sources.length > 0 ? [{ id: "guia-fuentes", label: "Fuentes", marker: "§" }] : []),
  ];

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
          <p className={eyebrowMono}>Guía</p>
          <h1 id="guia-title" className="mt-3 text-3xl sm:text-4xl">
            {guide.h1}
          </h1>
          <p className="mt-4 max-w-[62ch] text-lead text-fg-body">{guide.description}</p>
          <p className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 font-mono text-[13px] leading-snug text-fg-muted">
            <span>{guide.readingMinutes} min de lectura</span>
            <span aria-hidden="true">·</span>
            <time dateTime={guide.updatedAt} className="tabular-nums">
              Actualizada el {formatGuideDate(guide.updatedAt)}
            </time>
            <span aria-hidden="true">·</span>
            <span>Contenido educativo</span>
          </p>
        </header>

        <div className="mt-10 max-w-5xl lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start lg:gap-12">
          <aside className="mb-8 lg:order-2 lg:sticky lg:top-24 lg:mb-0">
            {/* <lg: plegado, con la fila de 44 px del índice; ≥lg: fijo junto al texto. */}
            <details className="group border-y border-border lg:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-medium text-fg [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  En esta guía
                  <span className="text-fg-muted"> · {toc.length} apartados</span>
                </span>
                <IconChevron className="disclosure-chevron size-4 shrink-0 text-fg-muted transition-transform duration-200 motion-reduce:transition-none" />
              </summary>
              <nav aria-label="En esta guía" className="pb-3">
                <GuideIndex items={toc} />
              </nav>
            </details>
            <nav aria-label="En esta guía" className="hidden lg:block">
              <p className="eyebrow">En esta guía</p>
              <GuideIndex items={toc} />
            </nav>
          </aside>

          <div className="min-w-0 max-w-[68ch] lg:order-1">
            <div className="space-y-10">
              {sections.map((section) => (
                <section
                  key={section.id}
                  aria-labelledby={section.id}
                  className="scroll-mt-24 border-t border-border pt-9 first:border-t-0 first:pt-0"
                >
                  <h2 id={section.id} className="text-2xl sm:text-3xl">
                    {section.heading}
                  </h2>
                  <div className="mt-4 space-y-5 text-[1.0625rem] leading-7 text-fg-body">
                    {section.paragraphs.map((paragraph, index) => (
                      <p key={index} className="text-pretty">
                        {paragraph}
                      </p>
                    ))}
                    {section.bullets && section.bullets.length > 0 ? (
                      <ul className="list-disc space-y-2 pl-5 marker:text-fg-muted">
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
              <section id="guia-faq" aria-labelledby="guia-faq-title" className="mt-12 scroll-mt-24 border-t border-border pt-9">
                <h2 id="guia-faq-title" className="text-2xl sm:text-3xl">
                  Preguntas frecuentes
                </h2>
                <DisclosureList items={faqItems(faq)} className="mt-4" />
              </section>
            ) : null}

            {sources.length > 0 ? (
              <section id="guia-fuentes" aria-labelledby="guia-fuentes-title" className="mt-12 scroll-mt-24 border-t border-border pt-9">
                <h2 id="guia-fuentes-title" className="text-2xl sm:text-3xl">
                  Fuentes
                </h2>
                <ul className="mt-3 text-sm leading-relaxed">
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
              <section
                id="guia-relacionadas"
                aria-labelledby="guia-relacionadas-title"
                className="mt-12 border-t border-border pt-9"
              >
                <h2 id="guia-relacionadas-title" className="text-2xl sm:text-3xl">
                  Sigue leyendo
                </h2>
                <ul className="mt-4 divide-y divide-border border-b border-border">
                  {related.map((item) => (
                    <li key={item.slug}>
                      <Link href={`/guias/${item.slug}`} className="group block py-5">
                        <span className="text-[1.0625rem] leading-snug font-medium text-fg">
                          <span className="underline decoration-transparent underline-offset-[5px] transition-colors duration-150 group-hover:decoration-fg motion-reduce:transition-none">
                            {item.title}
                          </span>
                        </span>
                        <span className="mt-1 block max-w-[62ch] text-[0.9375rem] leading-relaxed text-fg-body">
                          {item.description}
                        </span>
                        <span className="mt-2 block font-mono text-[13px] leading-none text-fg-muted">
                          {item.readingMinutes} min de lectura
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <footer className="mt-12 border-t border-border pt-9">
              <h2 className="text-base font-medium text-fg">Del texto al catálogo</h2>
              <p className="mt-2 max-w-[62ch] text-[0.9375rem] leading-relaxed text-fg-body">
                Cada ficha muestra el precio del token, los datos de la empresa tomados de la SEC y los riesgos
                de operar fuera del horario regular de la bolsa de EE.UU. Esta guía es educativa: no es asesoría
                financiera ni una recomendación de compra o venta.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Button asChild>
                  <Link href="/app/registro">Probar la demo</Link>
                </Button>
                <Link href="/acciones" className={textLinkClass}>
                  Ver acciones
                </Link>
                <Link href="/guias" className={`${textLinkClass} sm:ml-auto`}>
                  Todas las guías
                </Link>
              </div>
            </footer>
          </div>
        </div>
      </article>
    </LandingSection>
  );
}

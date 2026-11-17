import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuideReadMarker } from "@/components/domain/guide-read-marker";
import { GuideToc, type GuideTocItem } from "@/components/landing/guide-toc";
import { PageBreadcrumb } from "@/components/landing/page-breadcrumb";
import { PageHero } from "@/components/landing/page-hero";
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
    .replace(/[̀-ͯ]/g, "")
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

const textLinkClass =
  "inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg";

/** Encabezado de sección del artículo: peso 600 y aire para separar los apartados. */
const h2Class = "text-[1.625rem] leading-tight font-semibold sm:text-[1.875rem]";

/** La FAQ de la guía usa el mismo `<details>` sin JS que /ayuda. */
function faqItems(faq: NonNullable<Guide["faq"]>): DisclosureItem[] {
  return faq.map((entry) => ({
    id: entry.question,
    title: entry.question,
    content: <p className="max-w-[68ch] text-[0.9375rem] leading-relaxed sm:text-base">{entry.answer}</p>,
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
  const toc: GuideTocItem[] = [
    ...sections.map((section, index) => ({
      id: section.id,
      label: section.heading,
      marker: String(index + 1).padStart(2, "0"),
    })),
    ...(faq.length > 0 ? [{ id: "guia-faq", label: "Preguntas frecuentes", marker: "?" }] : []),
    ...(sources.length > 0 ? [{ id: "guia-fuentes", label: "Fuentes", marker: "§" }] : []),
  ];

  return (
    <>
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

      <PageHero
        titleId="guia-title"
        eyebrow="Guía"
        title={guide.h1}
        breadcrumb={
          <PageBreadcrumb
            items={[
              { label: "Inicio", href: "/" },
              { label: "Guías", href: "/guias" },
              { label: guide.title },
            ]}
          />
        }
        facts={[
          <span key="min">{guide.readingMinutes} min de lectura</span>,
          <time key="fecha" dateTime={guide.updatedAt}>
            Actualizada el {formatGuideDate(guide.updatedAt)}
          </time>,
          <span key="edu">Contenido educativo</span>,
        ]}
      >
        {guide.description}
      </PageHero>

      <div className="px-5 pt-10 pb-16 md:pt-14 md:pb-24">
        <article
          aria-labelledby="guia-title"
          className="mx-auto w-full max-w-6xl lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-16"
        >
          <GuideToc items={toc} />

          <div className="max-w-[68ch] min-w-0">
            <div className="space-y-14">
              {sections.map((section) => (
                <section
                  key={section.id}
                  aria-labelledby={section.id}
                  className="border-t border-border pt-12 first:border-t-0 first:pt-0"
                >
                  <h2 id={section.id} className={h2Class}>
                    {section.heading}
                  </h2>
                  <div className="mt-5 space-y-6 text-[1.0625rem] leading-[1.75] text-fg-body sm:text-lg sm:leading-8">
                    {section.paragraphs.map((paragraph, index) => (
                      <p key={index} className="text-pretty">
                        {paragraph}
                      </p>
                    ))}
                    {section.bullets && section.bullets.length > 0 ? (
                      <ul className="list-disc space-y-2.5 pl-5 marker:text-fg-muted">
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
              <section id="guia-faq" aria-labelledby="guia-faq-title" className="mt-14 border-t border-border pt-12">
                <h2 id="guia-faq-title" className={h2Class}>
                  Preguntas frecuentes
                </h2>
                <DisclosureList items={faqItems(faq)} className="mt-5" />
              </section>
            ) : null}

            {sources.length > 0 ? (
              <section
                id="guia-fuentes"
                aria-labelledby="guia-fuentes-title"
                className="mt-14 border-t border-border pt-12"
              >
                <h2 id="guia-fuentes-title" className={h2Class}>
                  Fuentes
                </h2>
                <ul className="mt-4 max-w-[68ch] text-[0.9375rem] leading-relaxed">
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
                className="mt-14 border-t border-border pt-12"
              >
                <h2 id="guia-relacionadas-title" className={h2Class}>
                  Sigue leyendo
                </h2>
                <ul className="mt-6 grid list-none gap-3 sm:gap-4">
                  {related.map((item) => (
                    <li key={item.slug}>
                      <Link
                        href={`/guias/${item.slug}`}
                        className="group flex min-h-11 items-start justify-between gap-4 rounded-bento border border-border bg-bg p-5 transition-colors hover:border-border-strong hover:bg-surface-1 motion-reduce:transition-none md:p-6"
                      >
                        <span className="min-w-0">
                          <span className="block text-lg leading-snug font-semibold tracking-tight text-fg">
                            {item.title}
                          </span>
                          <span className="mt-1.5 block text-[0.9375rem] leading-relaxed text-fg-body">
                            {item.description}
                          </span>
                          <span className="mt-3 block font-mono text-[13px] leading-none text-fg-muted">
                            {item.readingMinutes} min de lectura
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          className="shrink-0 text-lg leading-snug text-fg-muted transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-fg motion-reduce:transition-none"
                        >
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <footer className="mt-14 rounded-bento border border-border bg-surface-1 p-6 md:p-8">
              <h2 className="text-xl font-semibold tracking-tight text-fg">Del texto al catálogo</h2>
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
        </article>
      </div>
    </>
  );
}

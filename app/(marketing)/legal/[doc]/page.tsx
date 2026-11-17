import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalBody, LegalNav } from "@/components/landing/legal-document";
import { PageBreadcrumb } from "@/components/landing/page-breadcrumb";
import { PageHero } from "@/components/landing/page-hero";
import { site } from "@/config/site";
import { formatLegalDate, getLegalDocument, LEGAL_SLUGS } from "@/lib/content/legal";
import { breadcrumbJsonLd, JsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";

/** Un slug desconocido renderiza el 404 con H1, dentro del layout. */
export const dynamicParams = true;

export function generateStaticParams() {
  return LEGAL_SLUGS.map((doc) => ({ doc }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const { doc } = await params;
  const legal = await getLegalDocument(doc);
  if (!legal) {
    return pageMetadata({
      title: "Página no encontrada",
      description: "La dirección no existe o cambió.",
      path: `/legal/${doc}`,
      index: false,
      follow: false,
    });
  }
  return pageMetadata({
    title: legal.title,
    description: `${legal.title} de ${site.name}. Borrador sujeto a revisión legal. Versión ${legal.version}.`,
    path: `/legal/${legal.slug}`,
    index: false,
    follow: true,
  });
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const legal = await getLegalDocument(doc);
  if (!legal) notFound();

  const crumbs = [
    { name: "Inicio", path: "/" },
    { name: legal.title, path: `/legal/${legal.slug}` },
  ];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <PageHero
        titleId="legal-title"
        title={legal.title}
        breadcrumb={
          <div className="flex flex-col items-start gap-5">
            <PageBreadcrumb items={[{ label: "Inicio", href: "/" }, { label: legal.title }]} />
            <p
              role="note"
              className="flex w-full max-w-[68ch] items-start gap-3 rounded-xl border border-warn bg-warn-bg px-4 py-3 text-[15px] leading-relaxed font-medium text-fg"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 size-5 shrink-0 text-warn"
              >
                <path d="M12 3.5 2.75 19.5h18.5L12 3.5Z" />
                <path d="M12 10v4.5M12 17.25v.01" />
              </svg>
              <span>Borrador — [REVISIÓN ABOGADO]</span>
            </p>
          </div>
        }
        facts={[
          <span key="version">Versión {legal.version}</span>,
          <span key="fecha">Actualizado el {formatLegalDate(legal.updated)}</span>,
        ]}
      />

      <div className="px-5 pt-10 pb-16 md:pt-14 md:pb-24">
        <article aria-labelledby="legal-title" className="mx-auto w-full max-w-6xl">
          <LegalBody blocks={legal.blocks} />
          <LegalNav current={doc} />
        </article>
      </div>
    </>
  );
}

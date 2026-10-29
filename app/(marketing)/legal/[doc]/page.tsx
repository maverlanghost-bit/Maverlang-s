import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalBody, LegalNav } from "@/components/landing/legal-document";
import { LandingSection } from "@/components/landing/section";
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
    <LandingSection titleId="legal-title">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <article className="max-w-3xl">
        <nav aria-label="Migas" className="mb-6 text-sm text-fg-muted">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <li>
              <Link href="/" className="underline decoration-border underline-offset-4 hover:decoration-fg">
                Inicio
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-fg">
              {legal.title}
            </li>
          </ol>
        </nav>
        <p role="note" className="rounded-xl bg-warn-bg px-4 py-3 text-sm font-medium text-warn">
          Borrador — [REVISIÓN ABOGADO]
        </p>
        <h1 id="legal-title" className="mt-6 text-3xl sm:text-4xl">
          {legal.title}
        </h1>
        <p className="mt-3 text-sm text-fg-muted">
          Versión {legal.version} · Actualizado el {formatLegalDate(legal.updated)}
        </p>
        <LegalBody blocks={legal.blocks} />
        <LegalNav current={doc} />
      </article>
    </LandingSection>
  );
}

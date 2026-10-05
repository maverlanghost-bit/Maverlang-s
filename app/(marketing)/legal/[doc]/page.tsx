import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalBody } from "@/components/landing/legal-document";
import { LandingSection } from "@/components/landing/section";
import { site } from "@/config/site";
import { formatLegalDate, getLegalDocument, LEGAL_SLUGS } from "@/lib/content/legal";

export const dynamicParams = false;

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
  if (!legal) return { title: "Documento" };
  return {
    title: legal.title,
    description: `${legal.title} de ${site.name}. Borrador sujeto a revisión legal. Versión ${legal.version}.`,
  };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const legal = await getLegalDocument(doc);
  if (!legal) notFound();

  return (
    <main>
      <LandingSection titleId="legal-title">
        <article className="max-w-3xl">
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
        </article>
      </LandingSection>
    </main>
  );
}

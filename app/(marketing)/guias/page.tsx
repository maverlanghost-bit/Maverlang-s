import Link from "next/link";
import { GuideCard } from "@/components/landing/guide-card";
import { PageHero } from "@/components/landing/page-hero";
import { LandingSection } from "@/components/landing/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { visibleGuides } from "@/lib/content/guias";
import { breadcrumbJsonLd, itemListJsonLd, JsonLd } from "@/lib/seo/jsonld";
import { brandShort, pageMetadata } from "@/lib/seo/metadata";

export const revalidate = 3600;

const TITLE = `Guías de acciones tokenizadas | ${brandShort()}`;
const DESCRIPTION =
  "Guías cortas para entender las acciones tokenizadas en Chile: funcionamiento, compra de USDC, horarios, autocustodia y riesgos.";

export const metadata = pageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/guias",
  absolute: true,
});

const crumbs = [
  { name: "Inicio", path: "/" },
  { name: "Guías", path: "/guias" },
];

const textLinkClass =
  "inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg";

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

/** Tarjeta del hero: los títulos de las guías con su tiempo de lectura. */
function GuidesIndexCard({ guides }: { guides: ReturnType<typeof visibleGuides> }) {
  return (
    <nav
      aria-label="Índice de guías"
      className="rounded-bento border border-border bg-surface-1 p-5 sm:p-6 md:p-7"
    >
      <p className="label">Índice</p>
      <ol className="mt-3 divide-y divide-border">
        {guides.map((guide, index) => (
          <li key={guide.slug}>
            <Link
              href={`/guias/${guide.slug}`}
              className="group flex min-h-11 items-start gap-4 py-3.5"
            >
              <span aria-hidden="true" className="num pt-0.5 text-[13px] leading-snug text-fg-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1 text-[15px] leading-snug font-medium text-fg">
                <span className="underline decoration-transparent underline-offset-[5px] transition-colors duration-150 group-hover:decoration-fg motion-reduce:transition-none">
                  {guide.title}
                </span>
              </span>
              <span className="num shrink-0 pt-0.5 text-[13px] leading-snug text-fg-muted">
                {guide.readingMinutes} min
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Índice de guías: sólo las publicables (las de revisión legal no aparecen). */
export default function GuiasPage() {
  const guides = visibleGuides();

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      {guides.length > 0 ? (
        <JsonLd
          data={itemListJsonLd({
            name: "Guías de acciones tokenizadas",
            path: "/guias",
            items: guides.map((guide) => ({ name: guide.title, path: `/guias/${guide.slug}` })),
          })}
        />
      ) : null}

      <PageHero
        titleId="guias-title"
        eyebrow="Guías"
        title="Guías de acciones tokenizadas"
        facts={
          guides.length > 0
            ? [
                <span key="count">
                  <span className="num text-fg">{guides.length}</span>{" "}
                  {guides.length === 1 ? "guía publicada" : "guías publicadas"}
                </span>,
              ]
            : undefined
        }
        aside={guides.length > 0 ? <GuidesIndexCard guides={guides} /> : undefined}
      >
        Explicaciones cortas sobre cómo funciona una acción tokenizada, cómo se consigue USDC, el
        horario y los riesgos. Contenido educativo: no es asesoría financiera ni una recomendación
        de compra o venta.
      </PageHero>

      <LandingSection titleId="guias-lista" density="compact">
        <h2 id="guias-lista" className="sr-only">
          Todas las guías
        </h2>
        {guides.length === 0 ? (
          <EmptyState
            title="Las guías no están disponibles ahora."
            description="Estamos revisando el contenido antes de publicarlo."
            action={
              <Button asChild variant="secondary">
                <Link href="/acciones">Ver acciones</Link>
              </Button>
            }
          />
        ) : (
          <ol className="grid list-none gap-4 md:grid-cols-2 md:gap-5">
            {guides.map((guide, index) => (
              <li key={guide.slug} className="min-w-0">
                <GuideCard
                  href={`/guias/${guide.slug}`}
                  number={index + 1}
                  title={guide.title}
                  description={guide.description}
                  readingMinutes={guide.readingMinutes}
                  updatedAt={guide.updatedAt}
                  updatedLabel={formatGuideDate(guide.updatedAt)}
                />
              </li>
            ))}
          </ol>
        )}
      </LandingSection>

      <LandingSection titleId="guias-catalogo" tone="muted">
        <div className="grid gap-8 rounded-bento border border-border bg-bg p-6 md:p-10 lg:grid-cols-12 lg:items-center lg:gap-12">
          <div className="lg:col-span-7">
            <h2 id="guias-catalogo" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Del texto al catálogo
            </h2>
            <p className="mt-3 max-w-[62ch] text-[0.9375rem] leading-relaxed text-fg-body sm:text-base">
              Cada ficha de acción muestra el precio del token, los datos de la empresa tomados de la
              SEC y los riesgos de operar fuera del horario regular de la bolsa de EE.UU.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:col-span-5 lg:justify-end">
            <Button asChild>
              <Link href="/acciones">Ver acciones</Link>
            </Button>
            <Link href="/ayuda" className={textLinkClass}>
              Centro de ayuda
            </Link>
          </div>
        </div>
      </LandingSection>
    </>
  );
}

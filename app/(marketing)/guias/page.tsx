import Link from "next/link";
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

/** Rótulo mono del índice: 13 px, el mínimo de la escala editorial. */
const eyebrowMono =
  "font-mono text-[13px] leading-none font-medium uppercase tracking-[0.045em] text-fg-muted";

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

/** Índice de guías: sólo las publicables (las de revisión legal no aparecen). */
export default function GuiasPage() {
  const guides = visibleGuides();

  return (
    <LandingSection titleId="guias-title" density="compact">
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

      <div className="max-w-3xl">
        <p className={eyebrowMono}>Guías</p>
        <h1 id="guias-title" className="mt-3 text-3xl sm:text-4xl">
          Guías de acciones tokenizadas
        </h1>
        <p className="mt-4 max-w-[62ch] text-lead text-fg-body">
          Explicaciones cortas sobre cómo funciona una acción tokenizada, cómo se consigue USDC, el
          horario y los riesgos. Contenido educativo: no es asesoría financiera ni una recomendación
          de compra o venta.
        </p>
      </div>

      {guides.length === 0 ? (
        <EmptyState
          className="mt-10"
          title="Las guías no están disponibles ahora."
          description="Estamos revisando el contenido antes de publicarlo."
          action={
            <Button asChild variant="secondary">
              <Link href="/acciones">Ver acciones</Link>
            </Button>
          }
        />
      ) : (
        /* Índice editorial: una fila por guía, con hairlines en vez de tarjetas. */
        <div className="mt-10 max-w-4xl">
          <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-3">
            <span className={eyebrowMono}>Índice</span>
            <span className="text-[13px] text-fg-muted">
              <span className="num tabular-nums text-fg">{guides.length}</span>{" "}
              {guides.length === 1 ? "guía publicada" : "guías publicadas"}
            </span>
          </p>
          <ol>
            {guides.map((guide, index) => (
              <li key={guide.slug} className="border-b border-border">
                <Link
                  href={`/guias/${guide.slug}`}
                  className="group grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-4 py-7 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-x-6 sm:py-8"
                >
                  <span
                    aria-hidden="true"
                    className="num pt-1 text-[13px] leading-none tabular-nums text-fg-muted"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[1.0625rem] leading-snug font-medium text-fg sm:text-[1.125rem]">
                      <span className="underline decoration-transparent underline-offset-[5px] transition-colors duration-150 group-hover:decoration-fg motion-reduce:transition-none">
                        {guide.title}
                      </span>
                    </h2>
                    <p className="mt-2 max-w-[64ch] text-[0.9375rem] leading-relaxed text-fg-body">
                      {guide.description}
                    </p>
                    <p className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 font-mono text-[13px] leading-snug text-fg-muted">
                      <span className="uppercase tracking-[0.045em]">Guía</span>
                      <span aria-hidden="true">·</span>
                      <span>{guide.readingMinutes} min de lectura</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={guide.updatedAt} className="tabular-nums">
                        Actualizada el {formatGuideDate(guide.updatedAt)}
                      </time>
                      <span
                        aria-hidden="true"
                        className="ml-auto text-sm transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
                      >
                        →
                      </span>
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      <footer className="mt-12 max-w-4xl border-t border-border pt-8 md:mt-14">
        <h2 className="text-base font-medium text-fg">Del texto al catálogo</h2>
        <p className="mt-2 max-w-[62ch] text-[0.9375rem] leading-relaxed text-fg-body">
          Cada ficha de acción muestra el precio del token, los datos de la empresa tomados de la SEC
          y los riesgos de operar fuera del horario regular de la bolsa de EE.UU.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button asChild>
            <Link href="/acciones">Ver acciones</Link>
          </Button>
          <Link href="/ayuda" className={textLinkClass}>
            Centro de ayuda
          </Link>
        </div>
      </footer>
    </LandingSection>
  );
}

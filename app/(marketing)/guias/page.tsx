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

const linkClass =
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
        <p className="label">Guías</p>
        <h1 id="guias-title" className="mt-3 text-3xl sm:text-4xl">
          Guías de acciones tokenizadas
        </h1>
        <p className="mt-4 max-w-[62ch] text-lead text-fg-body">
          Explicaciones cortas para entender cómo funciona una acción tokenizada, cómo se consigue USDC
          desde Chile, qué pasa con el horario y la liquidez, y qué riesgos conviene mirar antes de operar.
          Contenido educativo: no es asesoría financiera ni una recomendación de compra o venta.
        </p>
        <ul className="mt-6 flex flex-wrap items-center gap-2">
          <li className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-1 px-3 py-1.5 text-xs leading-snug text-fg-body">
            <span className="font-mono font-medium tabular-nums text-fg">{guides.length}</span>
            <span>{guides.length === 1 ? "guía publicada" : "guías publicadas"}</span>
          </li>
          <li className="inline-flex items-center rounded-full border border-border bg-surface-1 px-3 py-1.5 text-xs leading-snug text-fg-body">
            Contenido educativo
          </li>
        </ul>
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
        /* Con tres guías, una columna de filas horizontales se lee mejor que tres tarjetas altas. */
        <ol className="mt-8 max-w-4xl divide-y divide-border border-y border-border">
          {guides.map((guide, index) => (
            <li key={guide.slug}>
              <Link
                href={`/guias/${guide.slug}`}
                className="group grid gap-2 py-6 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-x-6 sm:py-7"
              >
                <span
                  aria-hidden="true"
                  className="num text-xs leading-relaxed tabular-nums text-fg-muted sm:pt-1.5"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg leading-snug font-medium text-fg sm:text-xl">
                    <span className="underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-fg">
                      {guide.title}
                    </span>
                  </h2>
                  <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-fg-body">
                    {guide.description}
                  </p>
                  <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs leading-relaxed text-fg-muted">
                    <span>{guide.readingMinutes} min de lectura</span>
                    <span aria-hidden="true">·</span>
                    <span>Actualizada el {formatGuideDate(guide.updatedAt)}</span>
                    <span
                      aria-hidden="true"
                      className="ml-auto font-mono text-sm text-fg-muted transition group-hover:text-fg motion-safe:group-hover:translate-x-0.5"
                    >
                      →
                    </span>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}

      <aside className="mt-10 max-w-4xl rounded-3xl bg-surface-1 p-6 shadow-card md:p-8">
        <h2 className="text-base font-medium text-fg">Del texto al catálogo</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-body">
          Cada ficha de acción muestra el precio del token, los datos de la empresa tomados de la SEC y los
          riesgos de operar fuera del horario regular de la bolsa de EE.UU.
        </p>
        <p className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button asChild>
            <Link href="/acciones">Ver acciones</Link>
          </Button>
          <Link href="/ayuda" className={linkClass}>
            Centro de ayuda
          </Link>
        </p>
      </aside>
    </LandingSection>
  );
}

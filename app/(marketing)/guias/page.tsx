import Link from "next/link";
import { LandingSection } from "@/components/landing/section";
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
    <LandingSection titleId="guias-title">
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

      <div className="max-w-2xl">
        <p className="label">Guías</p>
        <h1 id="guias-title" className="mt-3 text-3xl sm:text-4xl">
          Guías de acciones tokenizadas
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
          Explicaciones cortas para entender cómo funciona una acción tokenizada, cómo se consigue USDC
          desde Chile, qué pasa con el horario y la liquidez, y qué riesgos conviene mirar antes de operar.
          Contenido educativo: no es asesoría financiera ni una recomendación de compra o venta.
        </p>
        <ul className="mt-6 flex flex-wrap items-center gap-2">
          <li className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-surface-1 px-3 py-1.5 text-xs leading-snug text-fg-body sm:text-sm">
            <span className="font-mono font-medium tabular-nums text-fg">{guides.length}</span>
            <span>{guides.length === 1 ? "guía publicada" : "guías publicadas"}</span>
          </li>
          <li className="inline-flex items-center rounded-full border border-border/80 bg-surface-1 px-3 py-1.5 text-xs leading-snug text-fg-body sm:text-sm">
            Contenido educativo
          </li>
        </ul>
      </div>

      {guides.length === 0 ? (
        <p className="mt-10 text-sm text-fg-muted">Las guías no están disponibles ahora.</p>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((guide) => (
            <li key={guide.slug} className="h-full">
              <Link
                href={`/guias/${guide.slug}`}
                className="group flex h-full min-h-11 flex-col rounded-3xl border border-border bg-surface-1 p-6 transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 motion-reduce:transition-none"
              >
                <span className="label">{guide.readingMinutes} min de lectura</span>
                <h2 className="mt-2 text-lg leading-snug font-medium text-fg sm:text-xl">{guide.title}</h2>
                <span className="mt-2 block text-sm leading-relaxed text-fg-body">{guide.description}</span>
                <span className="mt-auto flex items-end justify-between gap-3 pt-5 text-xs leading-relaxed text-fg-muted">
                  <span>Actualizada el {formatGuideDate(guide.updatedAt)}</span>
                  <span
                    aria-hidden="true"
                    className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-bg font-mono text-sm text-fg-muted transition duration-150 group-hover:border-border-strong group-hover:text-fg motion-safe:group-hover:translate-x-0.5 motion-reduce:transition-none"
                  >
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <aside className="mt-10 rounded-3xl border border-border bg-surface-1 p-6 md:p-8">
        <h2 className="text-base font-medium text-fg">Del texto al catálogo</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-body">
          Cada ficha de acción muestra el precio del token, los datos de la empresa tomados de la SEC y los
          riesgos de operar fuera del horario regular de la bolsa de EE.UU.
        </p>
        <p className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href="/acciones"
            className="inline-flex min-h-11 items-center rounded-full bg-fg px-5 text-sm text-white transition duration-[140ms] ease-spring hover:bg-[#1f2329] focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]"
          >
            Ver acciones
          </Link>
          <Link href="/ayuda" className={linkClass}>
            Centro de ayuda
          </Link>
        </p>
      </aside>
    </LandingSection>
  );
}

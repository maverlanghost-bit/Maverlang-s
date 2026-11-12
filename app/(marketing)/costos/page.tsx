import Link from "next/link";
import { CostSimulator } from "@/components/landing/cost-simulator";
import { CostsSection } from "@/components/landing/costs-section";
import { LandingSection } from "@/components/landing/section";
import { brandShort, pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: `Comisiones y costos de comprar acciones | ${brandShort()}`,
  description:
    "Comisión 0% en el lanzamiento, costo de red en Solana, diferencia de precio y proveedor de depósito: todo se muestra antes de confirmar la orden.",
  path: "/costos",
  absolute: true,
});

/** Una línea de datos: los tres datos que se repiten en la página. */
const RESUMEN = [
  "0% comisión de lanzamiento",
  "Costos visibles antes de firmar",
  "Red Solana < US$0,01",
] as const;

const linkClass =
  "inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 transition-colors hover:decoration-fg motion-reduce:transition-none";

/**
 * Página dedicada de costos: hero corto, el desglose de la portada (sin repetir
 * su titular), el simulador y el cierre con los enlaces.
 */
export default function CostosPage() {
  return (
    <>
      <LandingSection titleId="costos-page-title" density="compact" className="pb-6 md:pb-8">
        <div className="max-w-3xl">
          <p className="label">Costos</p>
          <h1 id="costos-page-title" className="mt-3 text-3xl sm:text-4xl">
            Lo que pagas, antes de confirmar
          </h1>
          <p className="mt-4 max-w-[62ch] text-lead text-fg-body">
            La comisión de lanzamiento es 0%. El resto depende del mercado, la red y el proveedor, y
            siempre aparece en el desglose antes de que aceptes la orden.
          </p>
          <p className="mt-5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[13px] leading-relaxed text-fg-muted">
            {RESUMEN.map((item, index) => (
              <span key={item} className="inline-flex items-baseline gap-2.5">
                {index > 0 ? (
                  <span aria-hidden="true" className="text-border-strong">
                    ·
                  </span>
                ) : null}
                <span className="tabular-nums">{item}</span>
              </span>
            ))}
          </p>
        </div>
      </LandingSection>

      <CostsSection showIntro={false} />

      <LandingSection titleId="costos-simulador" density="compact">
        <div className="grid gap-8 border-t border-border pt-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-start md:gap-12 md:pt-10">
          <div className="max-w-md">
            <p className="label">Simulador</p>
            <h2 id="costos-simulador" className="mt-3 text-2xl text-balance sm:text-3xl">
              Simulador interactivo de costos
            </h2>
            <p className="mt-4 max-w-[62ch] text-lead text-fg-body">
              Elige un monto y marca si es tu primera compra de ese activo: ves cuánto se va en
              comisión de plataforma y en red, y cuánto capital queda efectivamente en la acción.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-fg-muted">
              Son montos de ejemplo. El desglose definitivo, con la diferencia de precio y el
              proveedor, aparece antes de confirmar la orden.
            </p>
          </div>
          <div className="min-w-0 border-t border-border pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-10">
            <CostSimulator />
          </div>
        </div>
      </LandingSection>

      <LandingSection titleId="costos-cierre" density="compact">
        <div className="max-w-3xl border-t border-border pt-6">
          <h2 id="costos-cierre" className="sr-only">
            Seguir leyendo
          </h2>
          <p className="max-w-[62ch] text-sm leading-relaxed text-fg-body">
            El detalle legal de las comisiones y las respuestas del centro de ayuda están a un clic.
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/legal/comisiones" className={linkClass}>
              Ver el detalle de comisiones
            </Link>
            <Link href="/ayuda" className={linkClass}>
              Ir al centro de ayuda
            </Link>
          </p>
        </div>
      </LandingSection>
    </>
  );
}

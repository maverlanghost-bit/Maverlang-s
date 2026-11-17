import { CostSimulator } from "@/components/landing/cost-simulator";
import { CostsSection } from "@/components/landing/costs-section";
import { PageHero } from "@/components/landing/page-hero";
import { PageLinkCards } from "@/components/landing/page-link-cards";
import { LandingSection, SectionHeader } from "@/components/landing/section";
import { StatTile } from "@/components/landing/stat-tile";
import { brandShort, pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: `Comisiones y costos de comprar acciones | ${brandShort()}`,
  description:
    "Comisión 0% en el lanzamiento, costo de red en Solana, diferencia de precio y proveedor de depósito: todo se muestra antes de confirmar la orden.",
  path: "/costos",
  absolute: true,
});

/** Los datos que se repiten en la página; el primero ("0%") va en la tarjeta del hero. */
const RESUMEN = ["Costos visibles antes de firmar", "Red Solana < US$0,01"] as const;

/**
 * Página dedicada de costos: hero con el 0% a la vista, el desglose de la
 * portada (sin repetir su titular), el simulador en su propia tarjeta y el
 * cierre con los enlaces.
 */
export default function CostosPage() {
  return (
    <>
      <PageHero
        titleId="costos-page-title"
        eyebrow="Costos"
        title="Lo que pagas, antes de confirmar"
        facts={RESUMEN}
        factsLabel="Resumen de costos"
        aside={
          <div className="rounded-bento border border-border bg-surface-1 p-8 md:p-10">
            <StatTile label="Comisión de lanzamiento" value="0%" size="lg" />
          </div>
        }
      >
        La comisión de lanzamiento es 0%. El resto depende del mercado, la red y el proveedor, y
        siempre aparece en el desglose antes de que aceptes la orden.
      </PageHero>

      <CostsSection showIntro={false} />

      <LandingSection titleId="costos-simulador" tone="muted">
        <SectionHeader id="costos-simulador" align="split" eyebrow="Simulador" title="Simulador interactivo de costos">
          Elige un monto y marca si es tu primera compra de ese activo: ves cuánto se va en
          comisión de plataforma y en red, y cuánto capital queda efectivamente en la acción.
        </SectionHeader>
        <div className="mt-10 grid gap-6 md:mt-12 lg:grid-cols-12 lg:items-start lg:gap-10">
          <div className="min-w-0 rounded-bento border border-border bg-bg p-5 sm:p-6 md:p-8 lg:col-span-8">
            <CostSimulator />
          </div>
          <p className="max-w-[62ch] text-sm leading-relaxed text-fg-muted lg:col-span-4 lg:pt-2">
            Son montos de ejemplo. El desglose definitivo, con la diferencia de precio y el
            proveedor, aparece antes de confirmar la orden.
          </p>
        </div>
      </LandingSection>

      <LandingSection titleId="costos-cierre">
        <SectionHeader id="costos-cierre" align="split" title="Seguir leyendo">
          El detalle legal de las comisiones y las respuestas del centro de ayuda están a un clic.
        </SectionHeader>
        <PageLinkCards
          className="mt-8 md:mt-10"
          links={[
            { href: "/legal/comisiones", title: "Ver el detalle de comisiones" },
            { href: "/ayuda", title: "Ir al centro de ayuda" },
          ]}
        />
      </LandingSection>
    </>
  );
}

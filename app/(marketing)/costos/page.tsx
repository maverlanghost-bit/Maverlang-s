import Link from "next/link";
import { CostSimulator } from "@/components/landing/cost-simulator";
import { CostsSection } from "@/components/landing/costs-section";
import { LandingSection } from "@/components/landing/section";
import { Card } from "@/components/ui/card";
import { site } from "@/config/site";
import { brandShort, pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: `Comisiones y costos de comprar acciones | ${brandShort()}`,
  description:
    "Comisión 0% en el lanzamiento, costo de red en Solana, diferencia de precio y proveedor de depósito: todo se muestra antes de confirmar la orden.",
  path: "/costos",
  absolute: true,
});

/** Resumen en píldoras: los tres datos que se repiten en la página. */
const RESUMEN = [
  "0% comisión de lanzamiento",
  "Costos visibles antes de firmar",
  "Red Solana < US$0,01",
] as const;

/** Página dedicada de costos: la tabla de la portada, el simulador y el detalle por concepto. */
export default function CostosPage() {
  return (
    <>
      <LandingSection titleId="costos-page-title">
        <div className="max-w-2xl">
          <p className="label">Costos</p>
          <h1 id="costos-page-title" className="mt-3 text-3xl sm:text-4xl">
            Lo que pagas, antes de confirmar
          </h1>
          <ul aria-label="Resumen de costos" className="mt-5 flex flex-wrap items-center gap-2">
            {RESUMEN.map((item, index) => (
              <li
                key={item}
                className={
                  index === 0
                    ? "inline-flex items-center gap-2 rounded-full bg-fg px-3 py-1.5 text-[11px] leading-none font-medium text-white sm:text-xs"
                    : "inline-flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5 text-[11px] leading-none font-medium text-fg-body sm:text-xs"
                }
              >
                <span
                  aria-hidden="true"
                  className={
                    index === 0
                      ? "size-1.5 shrink-0 rounded-full bg-white/70"
                      : "size-1.5 shrink-0 rounded-full bg-fg-muted"
                  }
                />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm leading-relaxed text-fg-body sm:text-base">
            La comisión de lanzamiento es 0%. El resto depende del mercado, la red y el proveedor, y
            siempre aparece en el desglose antes de que aceptes la orden.
          </p>
        </div>
      </LandingSection>

      <CostsSection />

      <LandingSection titleId="costos-simulador">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-start md:gap-12">
          <div className="max-w-md">
            <p className="label">Simulador</p>
            <h2 id="costos-simulador" className="mt-3 text-2xl text-balance sm:text-3xl">
              Simulador interactivo de costos
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
              Elige un monto y marca si es tu primera compra de ese activo: ves cuánto se va en
              comisión de plataforma y en red, y cuánto capital queda efectivamente en la acción.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-fg-muted">
              Son montos de ejemplo. El desglose definitivo, con la diferencia de precio y el
              proveedor, aparece antes de confirmar la orden.
            </p>
          </div>
          <Card className="rounded-3xl p-5 sm:p-6 md:p-8">
            <CostSimulator />
          </Card>
        </div>
      </LandingSection>

      <LandingSection titleId="costos-detalle">
        <div className="max-w-5xl">
          <p className="label">Detalle</p>
          <h2 id="costos-detalle" className="mt-3 text-2xl text-balance sm:text-3xl">
            Concepto por concepto
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            <li className="flex h-full flex-col rounded-3xl border border-border bg-surface-1 p-5 transition-colors duration-200 hover:border-border-strong motion-reduce:transition-none sm:col-span-2 sm:p-7">
              <div className="flex items-start justify-between gap-6">
                <span aria-hidden="true" className="label">
                  01
                </span>
                <span
                  aria-hidden="true"
                  className="num hidden text-4xl leading-none tracking-tight text-fg/10 sm:block"
                >
                  0%
                </span>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-fg-body sm:text-base">
                <strong className="font-medium text-fg">Comisión {site.name}.</strong> 0% en el
                lanzamiento. Si cambia, lo verás aquí y en el desglose.
              </p>
            </li>
            <li className="flex h-full flex-col rounded-3xl border border-border bg-surface-1 p-5 transition-colors duration-200 hover:border-border-strong motion-reduce:transition-none sm:p-6">
              <span aria-hidden="true" className="label">
                02
              </span>
              <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
                <strong className="font-medium text-fg">Diferencia de precio.</strong> Variable según
                el mercado y la hora. Se muestra antes de confirmar.
              </p>
            </li>
            <li className="flex h-full flex-col rounded-3xl border border-border bg-surface-1 p-5 transition-colors duration-200 hover:border-border-strong motion-reduce:transition-none sm:p-6">
              <span aria-hidden="true" className="label">
                03
              </span>
              <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
                <strong className="font-medium text-fg">Red Solana.</strong> Del orden de centavos de
                dólar. El monto exacto aparece antes de confirmar.
              </p>
            </li>
            <li className="flex h-full flex-col rounded-3xl border border-border bg-surface-1 p-5 transition-colors duration-200 hover:border-border-strong motion-reduce:transition-none sm:p-6">
              <span aria-hidden="true" className="label">
                04
              </span>
              <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
                <strong className="font-medium text-fg">Cuenta del activo, la primera vez.</strong>{" "}
                Costo de red por abrir la cuenta del token. Se muestra en el desglose.
              </p>
            </li>
            <li className="flex h-full flex-col rounded-3xl border border-border bg-surface-1 p-5 transition-colors duration-200 hover:border-border-strong motion-reduce:transition-none sm:col-span-2 sm:p-6">
              <span aria-hidden="true" className="label">
                05
              </span>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-fg-body sm:text-base">
                <strong className="font-medium text-fg">Proveedor de depósito.</strong> Depende del
                método que elijas al depositar. Lo ves en ese paso, antes de confirmar.
              </p>
            </li>
          </ul>
          <p className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
            <Link
              href="/legal/comisiones"
              className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
            >
              Ver el detalle de comisiones
            </Link>
            <Link
              href="/ayuda"
              className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
            >
              Ir al centro de ayuda
            </Link>
          </p>
        </div>
      </LandingSection>
    </>
  );
}

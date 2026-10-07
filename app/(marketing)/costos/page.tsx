import type { Metadata } from "next";
import Link from "next/link";
import { CostsSection } from "@/components/landing/costs-section";
import { LandingSection } from "@/components/landing/section";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Costos",
  description: `Qué pagas en ${site.name}: comisión 0% en el lanzamiento, red, diferencia de precio y proveedor, siempre antes de confirmar.`,
};

/** Página dedicada de costos: la tabla de la portada más el detalle por concepto. */
export default function CostosPage() {
  return (
    <main>
      <LandingSection titleId="costos-page-title">
        <div className="max-w-2xl">
          <p className="label">Costos</p>
          <h1 id="costos-page-title" className="mt-3 text-3xl sm:text-4xl">
            Lo que pagas, antes de confirmar
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
            La comisión de lanzamiento es 0%. El resto depende del mercado, la red y el proveedor, y
            siempre aparece en el desglose antes de que aceptes la orden.
          </p>
        </div>
      </LandingSection>
      <CostsSection />
      <LandingSection titleId="costos-detalle">
        <div className="max-w-3xl">
          <h2 id="costos-detalle" className="text-xl sm:text-2xl">
            Concepto por concepto
          </h2>
          <ul className="mt-6 space-y-4 text-sm leading-relaxed text-fg-body sm:text-base">
            <li>
              <strong className="font-medium text-fg">Comisión {site.name}.</strong> 0% en el
              lanzamiento. Si cambia, lo verás aquí y en el desglose.
            </li>
            <li>
              <strong className="font-medium text-fg">Diferencia de precio.</strong> Variable según el
              mercado y la hora. Se muestra antes de confirmar.
            </li>
            <li>
              <strong className="font-medium text-fg">Red Solana.</strong> Del orden de centavos de
              dólar. El monto exacto aparece antes de confirmar.
            </li>
            <li>
              <strong className="font-medium text-fg">Proveedor de depósito.</strong> Depende del
              método que elijas al depositar pesos. Lo ves en ese paso.
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
    </main>
  );
}

import Link from "next/link";

import { COST_ROWS } from "@/components/landing/costs-section";
import { Reveal } from "@/components/landing/reveal";
import { LandingSection } from "@/components/landing/section";
import { site } from "@/config/site";

/**
 * Costos en una franja (T90). El 0 % de la comisión de lanzamiento es el foco
 * (cifra de la tabla de costos, no un número de marketing); los demás conceptos
 * van en una lista corta con su detalle. El simulador y la tabla completa
 * siguen en /costos.
 */
export function CostsStrip() {
  const others = COST_ROWS.slice(1);

  return (
    <LandingSection id="costos" titleId="costos-title" tone="muted">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16">
        <Reveal>
          <h2 id="costos-title" className="max-w-[14ch] text-title text-balance">
            Lo que pagas, antes de confirmar.
          </h2>
          <div className="mt-8 flex items-end gap-4">
            <p className="num text-[clamp(5.5rem,4rem+6vw,9rem)] leading-[0.8] tracking-[-0.06em] text-fg">0%</p>
            <p className="max-w-[12rem] pb-2 text-[15px] leading-snug text-fg-body">
              Comisión {site.name} en el lanzamiento.
            </p>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <p className="text-[15px] leading-relaxed text-fg-body">
            El resto depende del mercado, la red y el proveedor. Todo aparece en el desglose antes de firmar.
          </p>
          <dl className="mt-5 divide-y divide-border border-y border-border">
            {others.map((row) => (
              <div key={row.concept} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-6">
                <dt className="text-[15px] font-medium text-fg">{row.concept}</dt>
                <dd className="text-[15px] leading-relaxed text-fg-muted">{row.detail}</dd>
              </div>
            ))}
          </dl>
          <Link
            href="/costos"
            className="mt-4 inline-flex min-h-11 items-center text-[15px] font-medium text-fg underline decoration-border-strong underline-offset-[6px] transition-colors hover:decoration-fg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fg"
          >
            Simular el costo de una orden
          </Link>
        </Reveal>
      </div>
    </LandingSection>
  );
}

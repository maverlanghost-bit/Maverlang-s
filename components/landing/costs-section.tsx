import Link from "next/link";
import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { site } from "@/config/site";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

const rows: { concept: string; detail: string }[] = [
  {
    concept: `Comisión ${site.name}`,
    detail: "0% en el lanzamiento.",
  },
  {
    concept: "Diferencia de precio",
    detail: "Variable. Se muestra antes de confirmar.",
  },
  {
    // Red y cuenta del activo: montos en SOL desde lib/wallet/send-cost.ts
    // (ARQUITECTURA §6: se muestran en SOL, sin conversión a dólares aquí).
    concept: "Red Solana",
    detail: "Del orden de centavos de dólar. El monto se muestra antes de confirmar.",
  },
  {
    concept: "Cuenta del activo, la primera vez",
    detail: "Costo de red por abrir la cuenta del token. Se muestra en el desglose.",
  },
  {
    concept: "Proveedor de depósito",
    detail: "Según el proveedor. Lo ves al depositar.",
  },
];

/** Afirmaciones cortas: antes eran píldoras; ahora una línea de tinta. */
const notes: string[] = ["Desglose previo a firmar", "Red Solana ultrarrápida"];

const INTRO_TITLE = "Lo que pagas, antes de confirmar";

/**
 * Costos de la compra. `showIntro={false}` lo usa /costos, que ya trae ese
 * texto como titular de página: no se repite a la vista, pero el ancla de la
 * sección (`#costos-title`) se conserva para el `aria-labelledby`.
 */
export function CostsSection({ showIntro = true }: { showIntro?: boolean }) {
  return (
    <LandingSection id="costos" titleId="costos-title">
      {showIntro ? (
        <Reveal>
          <SectionIntro id="costos-title" title={INTRO_TITLE}>
            La comisión de lanzamiento es 0%. El resto depende del mercado, la red y el proveedor. Si hay
            que crear la cuenta del activo, ese costo también aparece en el desglose.
          </SectionIntro>
        </Reveal>
      ) : (
        <h2 id="costos-title" className="sr-only">
          {INTRO_TITLE}
        </h2>
      )}
      <div className="mt-10 border-t border-border md:mt-14">
        <div className="grid lg:grid-cols-12">
          <Reveal className="lg:col-span-4 lg:border-r lg:border-border">
            <div className="py-8 lg:py-10 lg:pr-10">
              <p className="label">Comisión de plataforma</p>
              <p className="num mt-5 text-6xl leading-[0.9] tracking-[-0.04em] text-fg sm:text-7xl">
                0%
              </p>
              <p className="mt-5 text-sm font-medium leading-relaxed text-fg">
                Comisión de plataforma en lanzamiento
              </p>
              <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-fg-body">
                No es un cobro nuestro sobre tu compra. Los demás costos vienen del mercado, la red y el
                proveedor, y aparecen en el desglose antes de confirmar.
              </p>

              <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4">
                {notes.map((note) => (
                  <li
                    key={note}
                    className="flex items-center gap-2 text-[13px] leading-snug text-fg-muted"
                  >
                    <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-border-strong" />
                    {note}
                  </li>
                ))}
              </ul>

              <p className="mt-6 text-[13px] leading-relaxed text-fg-muted">
                Los montos de red y de depósito dependen del proveedor. El desglose completo se muestra
                antes de firmar, así que sabes qué pagas antes de confirmar.
              </p>
            </div>
          </Reveal>

          <Reveal delay={REVEAL_STAGGER_MS * 2} className="lg:col-span-8">
            <div className="py-8 lg:py-10 lg:pl-10">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <p className="label">Desglose de costos</p>
                <p className="text-[13px] text-fg-muted">Se muestra antes de confirmar</p>
              </div>

              {/* <sm: un bloque por concepto. La tabla de 512px no cabe en 390px. */}
              <dl
                aria-label="Desglose de costos"
                className="mt-5 divide-y divide-border border-y border-border sm:hidden"
              >
                {rows.map((row) => (
                  <div key={row.concept} className="py-4">
                    <dt className="text-sm font-medium leading-relaxed text-fg">{row.concept}</dt>
                    <dd className="mt-2 text-sm leading-relaxed text-fg-body">{row.detail}</dd>
                  </div>
                ))}
              </dl>

              {/* ≥sm: la tabla de siempre. Con scroll horizontal de reserva si no cabe. */}
              <div className="mt-5 hidden overflow-x-auto sm:block">
                <table className="w-full border-y border-border text-left text-sm md:min-w-[32rem]">
                  <caption className="sr-only">Costos de {site.name}</caption>
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="eyebrow border-b border-border py-3 pr-6 align-bottom"
                      >
                        Concepto
                      </th>
                      <th
                        scope="col"
                        className="eyebrow border-b border-border py-3 align-bottom"
                      >
                        Qué pagas
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.concept}
                        className="border-b border-border transition-colors last:border-b-0 hover:bg-surface-1 motion-reduce:transition-none"
                      >
                        <th
                          scope="row"
                          className="w-[44%] py-4 pr-6 align-top font-medium leading-relaxed text-fg"
                        >
                          {row.concept}
                        </th>
                        <td className="py-4 align-top leading-relaxed text-fg-body">{row.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-6">
                <Link
                  href="/legal/comisiones"
                  className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-fg underline decoration-border underline-offset-4 transition-colors hover:decoration-fg motion-reduce:transition-none"
                >
                  Ver el detalle de comisiones
                  <span aria-hidden="true">→</span>
                </Link>
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </LandingSection>
  );
}

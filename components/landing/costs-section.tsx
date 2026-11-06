import Link from "next/link";
import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { Card } from "@/components/ui/card";
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

const badges: string[] = ["Desglose previo a firmar", "Red Solana ultrarrápida"];

export function CostsSection() {
  return (
    <LandingSection id="costos" titleId="costos-title">
      <Reveal>
        <SectionIntro id="costos-title" title="Lo que pagas, antes de confirmar">
          La comisión de lanzamiento es 0%. El resto depende del mercado, la red y el proveedor. Si hay
          que crear la cuenta del activo, ese costo también aparece en el desglose.
        </SectionIntro>
      </Reveal>
      <div className="mt-10 grid gap-4 md:mt-14 lg:grid-cols-5 lg:gap-6">
        <Reveal delay={REVEAL_STAGGER_MS} className="lg:col-span-2">
          <Card className="flex h-full flex-col gap-8 rounded-3xl p-6 md:p-8">
            <div>
              <p className="label">Comisión de plataforma</p>
              <p className="mt-4 font-mono text-5xl leading-none tracking-tight tabular-nums text-fg sm:text-6xl">
                0%
              </p>
              <p className="mt-4 text-sm font-medium leading-relaxed text-fg">
                Comisión de plataforma en lanzamiento
              </p>
              <p className="mt-2 text-sm leading-relaxed text-fg-body">
                No es un cobro nuestro sobre tu compra. Los demás costos vienen del mercado, la red y el
                proveedor, y aparecen en el desglose antes de confirmar.
              </p>
            </div>
            <ul className="flex flex-wrap gap-2">
              {badges.map((badge) => (
                <li
                  key={badge}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg-body"
                >
                  <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-fg" />
                  {badge}
                </li>
              ))}
            </ul>
            <p className="mt-auto border-t border-border pt-4 text-xs leading-relaxed text-fg-muted">
              Los montos de red y de depósito dependen del proveedor. El desglose completo se muestra
              antes de firmar, así que sabes qué pagas antes de confirmar.
            </p>
          </Card>
        </Reveal>
        <Reveal delay={REVEAL_STAGGER_MS * 2} className="lg:col-span-3">
          <Card className="flex h-full flex-col overflow-hidden rounded-3xl p-0 md:p-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-5 py-4 md:px-7 md:py-5">
              <p className="label">Desglose de costos</p>
              <p className="text-xs text-fg-muted">Se muestra antes de confirmar</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <caption className="sr-only">Costos de {site.name}</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="label px-5 py-3 font-medium md:px-7">
                      Concepto
                    </th>
                    <th scope="col" className="label px-5 py-3 font-medium md:px-7">
                      Qué pagas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.concept}
                      className="border-b border-border transition-colors last:border-b-0 hover:bg-surface-2 motion-reduce:transition-none"
                    >
                      <th
                        scope="row"
                        className="w-[46%] px-5 py-4 align-top font-medium leading-relaxed text-fg md:w-2/5 md:px-7 md:py-5"
                      >
                        {row.concept}
                      </th>
                      <td className="px-5 py-4 align-top leading-relaxed text-fg-muted md:px-7 md:py-5">
                        {row.detail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-auto border-t border-border px-5 py-4 md:px-7">
              <Link
                href="/legal/comisiones"
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-fg underline decoration-border underline-offset-4 transition-colors hover:decoration-fg motion-reduce:transition-none"
              >
                Ver el detalle de comisiones
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </Card>
        </Reveal>
      </div>
    </LandingSection>
  );
}

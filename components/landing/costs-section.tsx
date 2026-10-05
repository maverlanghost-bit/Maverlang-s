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
    // TODO-VERIFICAR: el patrocinio del fee-payer está [POR DECIDIR] (§6.5).
    // La rent de la cuenta (≈0,0016 SOL) se muestra la primera vez; no se convierte a dólares aquí.
    concept: "Red Solana",
    detail: "Del orden de centavos de dólar. El monto se muestra antes de confirmar.",
  },
  {
    concept: "Proveedor de depósito",
    detail: "Según el proveedor. Lo ves al depositar.",
  },
];

export function CostsSection() {
  return (
    <LandingSection id="costos" titleId="costos-title">
      <Reveal>
        <SectionIntro id="costos-title" label="06 — Costos" title="Lo que pagas, antes de confirmar">
          La comisión de lanzamiento es 0%. El resto depende del mercado, la red y el proveedor. Si hay
          que crear la cuenta del activo, ese costo también aparece en el desglose.
        </SectionIntro>
      </Reveal>
      <Reveal delay={REVEAL_STAGGER_MS} className="mt-10 md:mt-14">
        <Card className="p-0 md:p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Costos de {site.name}</caption>
              <thead>
                <tr className="border-b border-border text-fg-muted">
                  <th scope="col" className="px-4 py-4 font-medium md:px-8">
                    Concepto
                  </th>
                  <th scope="col" className="px-4 py-4 font-medium md:px-8">
                    Qué pagas
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.concept} className="border-b border-border last:border-b-0">
                    <th scope="row" className="w-[46%] px-4 py-4 align-top font-medium text-fg md:w-2/5 md:px-8">
                      {row.concept}
                    </th>
                    <td className="px-4 py-4 align-top leading-relaxed text-fg-body md:px-8">{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="mt-6">
          <Link
            href="/legal/comisiones"
            className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
          >
            Ver el detalle de comisiones
          </Link>
        </p>
      </Reveal>
    </LandingSection>
  );
}

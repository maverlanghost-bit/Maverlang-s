import Link from "next/link";
import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { Card } from "@/components/ui/card";
import { site } from "@/config/site";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

const points: { title: string; body: string; extra?: "risks" }[] = [
  {
    // TODO-VERIFICAR: autocustodia vía billetera embebida. Exportar la clave está marcado [según Privy].
    title: "Billetera de tu cuenta",
    body: "El token es tuyo y queda en la billetera de tu cuenta. La idea es que lo controles tú; falta confirmar cómo se exporta la clave.",
  },
  {
    // TODO-VERIFICAR: no usar «emisor regulado» hasta cerrar la redacción. El catálogo dice issuer "Backed (xStocks)".
    title: "Emisor: Backed (xStocks)",
    body: "Las acciones tokenizadas del catálogo las emite Backed (xStocks). Cómo describir su marco todavía está en revisión.",
  },
  {
    title: "Qué no es",
    body: "El token es tuyo, en tu billetera, y sigue el precio de la acción. No te convierte en accionista registrado ni te da voto. El emisor puede restringir el activo. Puedes perder lo que invertiste. [REVISIÓN ABOGADO]",
    extra: "risks",
  },
];

export function SecuritySection() {
  return (
    <LandingSection id="seguridad" titleId="seguridad-title">
      <Reveal>
        <SectionIntro id="seguridad-title" label="07 — Seguridad" title="Qué tienes y qué no">
          {site.name} no es una corredora de EE.UU. El token es tuyo y queda en tu billetera. Sigue el precio de la acción.
        </SectionIntro>
      </Reveal>
      <div className="mt-10 grid gap-4 md:mt-14 md:grid-cols-3">
        {points.map((point, index) => (
          <Reveal key={point.title} delay={(index + 1) * REVEAL_STAGGER_MS} className="h-full">
            <Card className="flex h-full flex-col gap-4">
              <h3 className="text-base leading-relaxed">{point.title}</h3>
              <p className="text-sm leading-relaxed text-fg-body">{point.body}</p>
              {point.extra === "risks" ? (
                <p className="mt-auto">
                  <Link
                    href="/legal/riesgos"
                    className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
                  >
                    Leer los riesgos
                  </Link>
                </p>
              ) : null}
            </Card>
          </Reveal>
        ))}
      </div>
    </LandingSection>
  );
}

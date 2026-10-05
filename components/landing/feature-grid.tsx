import type { ReactNode } from "react";
import { PriceText } from "@/components/domain/price-text";
import { Card } from "@/components/ui/card";
import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { site } from "@/config/site";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

const features: { title: string; body: string; visual: ReactNode }[] = [
  {
    // Piso de producto, el mismo del hero. No es una cifra de mercado.
    title: "Fracciones desde $1.000",
    body: "Puedes comprar una parte de la acción, no el papel entero.",
    visual: <PriceText value={1000} currency="CLP" size="md" />,
  },
  {
    // TODO-VERIFICAR: autocustodia. Exportar la clave está en el diseño de perfil, marcado [según Privy].
    title: "Tú controlas tus activos (autocustodia)",
    body: "El token es tuyo y queda en una billetera embebida de tu cuenta. El modelo exacto de la clave sigue en revisión.",
    visual: <p className="text-sm font-medium text-fg">Billetera embebida</p>,
  },
  {
    // ARQUITECTURA §6.3: la comisión se muestra siempre en el desglose, antes de confirmar.
    title: "Costos claros antes de confirmar",
    body: "Ves comisión, red e impacto de mercado antes de aceptar la orden.",
    visual: (
      <ul className="space-y-1 text-sm text-fg-body">
        <li className="flex justify-between gap-3">
          <span>Comisión</span>
          <span className="num text-fg">0%</span>
        </li>
        <li className="flex justify-between gap-3">
          <span>Red e impacto</span>
          <span>al confirmar</span>
        </li>
      </ul>
    ),
  },
  {
    // Hay onboarding (país, declaración y términos). No hay cuenta en un broker de EE.UU.
    title: "Sin papeleo de broker extranjero",
    body: "No abres una cuenta en un broker de EE.UU. Sí aceptas términos al crear la tuya.",
    visual: <p className="text-sm text-fg-body">Sin cuenta en un broker de EE.UU.</p>,
  },
];

export function FeatureGrid() {
  return (
    <LandingSection titleId="idea-title">
      <Reveal>
        <SectionIntro id="idea-title" label="05 — La idea" title="Fracciones, con los costos a la vista">
          Cuatro reglas de {site.name}. Ninguna es una promesa de ganancia.
        </SectionIntro>
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 md:mt-14">
        {features.map((feature, index) => (
          <Reveal key={feature.title} delay={(index + 1) * REVEAL_STAGGER_MS} className="h-full">
            <Card className="flex h-full flex-col gap-6">
              <div>
                <h3 className="text-base leading-relaxed">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-body">{feature.body}</p>
              </div>
              <div className="mt-auto rounded-xl bg-bg px-4 py-4">{feature.visual}</div>
            </Card>
          </Reveal>
        ))}
      </div>
    </LandingSection>
  );
}

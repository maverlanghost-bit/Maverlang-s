import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { site } from "@/config/site";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";
import { cn } from "@/lib/cn";

const features: { title: string; body: string }[] = [
  {
    // Piso de producto, el mismo del hero (LANDING_MIN_ORDER_USD, en dólares).
    title: `Fracciones desde US$${LANDING_MIN_ORDER_USD}`,
    body: "Puedes comprar una parte de la acción, no el papel entero. Queda en tu propia billetera —nosotros no custodiamos tus activos— y la cantidad exacta depende del precio al confirmar.",
  },
  {
    title: "Precios en dólares (US$)",
    body: "Cada acción se muestra en dólares, con su variación, antes de operar.",
  },
  {
    title: "Operas 24/7",
    body: "Puedes operar a cualquier hora. Fuera del horario regular de la bolsa de EE.UU., el precio puede variar más.",
  },
  {
    title: "Sin cuenta en una corredora de EE.UU.",
    body: "No abres una cuenta en una corredora de Estados Unidos. Sí aceptas términos al crear la tuya.",
  },
];

export function FeatureGrid() {
  return (
    <LandingSection titleId="idea-title">
      <Reveal>
        <SectionIntro id="idea-title" title={`Cuatro reglas de ${site.name}`}>
          Ninguna es una promesa de ganancia.
        </SectionIntro>
      </Reveal>

      <ul className="mt-10 grid border-t border-border md:mt-14 md:grid-cols-2">
        {features.map((feature, index) => (
          <li
            key={feature.title}
            className={cn(
              "border-b border-border",
              index % 2 === 0 ? "md:border-r md:pr-8 lg:pr-12" : "md:pl-8 lg:pl-12",
            )}
          >
            <Reveal delay={(index + 1) * REVEAL_STAGGER_MS} className="h-full py-7 md:py-8">
              <div className="flex items-baseline gap-3">
                <span aria-hidden className="num w-5 shrink-0 text-[13px] leading-none text-fg-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[17px] leading-snug text-pretty sm:text-lg">{feature.title}</h3>
                  <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-fg-body text-pretty">
                    {feature.body}
                  </p>
                </div>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
    </LandingSection>
  );
}

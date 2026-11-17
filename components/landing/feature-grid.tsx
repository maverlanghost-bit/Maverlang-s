import type { ReactNode } from "react";
import { BentoCard, BentoGrid } from "@/components/landing/bento";
import { Reveal } from "@/components/landing/reveal";
import { LandingSection, SectionHeader } from "@/components/landing/section";
import { site } from "@/config/site";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";

/* Mini visuales: marcado plano o SVG en monocromo, decorativos (aria-hidden). */

/** Una fracción de una acción: barra con un tramo marcado. */
function FractionVisual() {
  return (
    <div aria-hidden>
      <div className="relative h-3 overflow-hidden rounded-full bg-surface-3">
        <span className="absolute inset-y-0 left-0 w-[16%] rounded-full bg-fg" />
      </div>
      <div className="mt-2 flex items-center justify-between text-[13px] leading-none text-fg-muted">
        <span>Tu fracción</span>
        <span>Una acción entera</span>
      </div>
    </div>
  );
}

function DollarVisual() {
  return (
    <p aria-hidden className="num text-5xl leading-none tracking-[-0.04em] text-fg">
      US$
    </p>
  );
}

const DAYS = ["L", "M", "X", "J", "V", "S", "D"] as const;

/** Siete marcas de día, todas llenas: se opera toda la semana. */
function WeekVisual() {
  return (
    <div aria-hidden className="grid grid-cols-7 gap-1.5">
      {DAYS.map((day) => (
        <div key={day} className="flex flex-col items-center gap-1.5">
          <span className="h-8 w-full rounded-md bg-fg" />
          <span className="num text-[13px] leading-none text-fg-muted">{day}</span>
        </div>
      ))}
    </div>
  );
}

/** Corredora de EE.UU. tachada frente a la cuenta propia. */
function BrokerVisual() {
  return (
    <div aria-hidden className="grid gap-2 text-[13px] leading-none">
      <span className="rounded-full border border-dashed border-border-strong px-3 py-2 text-fg-muted line-through">
        Cuenta en una corredora de EE.UU.
      </span>
      <span className="rounded-full bg-fg px-3 py-2 text-white">Tu cuenta en {site.name}</span>
    </div>
  );
}

function ZeroVisual() {
  return (
    <p aria-hidden className="num text-6xl leading-[0.9] tracking-[-0.04em] text-fg sm:text-7xl">
      0%
    </p>
  );
}

/** La llave y la billetera: el token queda en la cuenta del usuario. */
function KeyVisual() {
  return (
    <div aria-hidden className="flex items-center gap-3">
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-1 text-fg">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[22px]"
        >
          <circle cx="8.25" cy="15.75" r="3.5" />
          <path d="M10.75 13.25 19.5 4.5" />
          <path d="M16.5 7.5 19 10" />
          <path d="M14 10l2.5 2.5" />
        </svg>
      </span>
      <span className="label">Llave propia</span>
    </div>
  );
}

const features: {
  title: string;
  body: string;
  visual: ReactNode;
  /** Ancho en la grilla de seis columnas (sólo escritorio). */
  span: string;
}[] = [
  {
    // Piso de producto, el mismo del hero (LANDING_MIN_ORDER_USD, en dólares).
    title: `Fracciones desde US$${LANDING_MIN_ORDER_USD}`,
    body: "Puedes comprar una parte de la acción, no el papel entero. La cantidad exacta depende del precio al confirmar.",
    visual: <FractionVisual />,
    span: "lg:col-span-4",
  },
  {
    title: "Precios en dólares (US$)",
    body: "Cada acción se muestra en dólares, con su variación, antes de operar.",
    visual: <DollarVisual />,
    span: "lg:col-span-2",
  },
  {
    title: "Operas 24/7",
    body: "Puedes operar a cualquier hora. Fuera del horario regular de la bolsa de EE.UU., el precio puede variar más.",
    visual: <WeekVisual />,
    span: "lg:col-span-3",
  },
  {
    title: "Sin cuenta en una corredora de EE.UU.",
    body: "No abres una cuenta en una corredora de Estados Unidos. Sí aceptas términos al crear la tuya.",
    visual: <BrokerVisual />,
    span: "lg:col-span-3",
  },
  {
    title: "Comisión 0% en el lanzamiento",
    body: "No es un cobro nuestro sobre tu compra. Los demás costos vienen del mercado, la red y el proveedor, y aparecen en el desglose antes de confirmar.",
    visual: <ZeroVisual />,
    span: "lg:col-span-3",
  },
  {
    title: "El token queda en tu propia billetera",
    body: "El token es tuyo y queda en la billetera de tu cuenta: nosotros no custodiamos tus activos.",
    visual: <KeyVisual />,
    span: "lg:col-span-3",
  },
];

/**
 * T70: bento de seis tarjetas sobre fondo gris. Cada una trae un visual
 * pequeño y decorativo; ninguna lleva cifras nuevas.
 */
export function FeatureGrid() {
  return (
    <LandingSection titleId="idea-title" tone="muted">
      <Reveal>
        <SectionHeader
          id="idea-title"
          eyebrow="Por qué"
          title={`Seis reglas de ${site.name}`}
          align="split"
        >
          Ninguna es una promesa de ganancia.
        </SectionHeader>
      </Reveal>

      <BentoGrid as="ul" className="mt-10 md:mt-14">
        {features.map((feature, index) => (
          <li key={feature.title} className={`flex min-w-0 ${feature.span}`}>
            <Reveal delay={index * REVEAL_STAGGER_MS} className="flex min-w-0 flex-1 flex-col">
              <BentoCard title={feature.title} visual={feature.visual} className="flex-1">
                {feature.body}
              </BentoCard>
            </Reveal>
          </li>
        ))}
      </BentoGrid>
    </LandingSection>
  );
}

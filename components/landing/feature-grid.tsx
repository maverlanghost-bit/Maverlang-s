import type { ComponentType, ReactNode, SVGProps } from "react";
import { PriceText } from "@/components/domain/price-text";
import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { Card } from "@/components/ui/card";
import { IconChart, IconCheck, IconGlobe, IconWallet } from "@/components/ui/icons";
import { site } from "@/config/site";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";
import { cn } from "@/lib/cn";

/**
 * Misma fracción de ejemplo que el paso "Elige una acción" de how-it-works.
 * No es una cotización ni un saldo: cambia con el precio al confirmar.
 */
const EXAMPLE_SHARES = "0.0438";
/** 0.0438 de una acción, en porcentaje. Etiqueta de la barra, no una cifra de mercado. */
const EXAMPLE_SHARE_FRACTION = "4,38%";

const glyphs: ComponentType<SVGProps<SVGSVGElement>>[] = [
  IconChart,
  IconWallet,
  IconCheck,
  IconGlobe,
];

/** Grilla asimétrica: 4+2 arriba, 2+4 abajo. En móvil, una sola columna. */
const spans = ["md:col-span-4", "md:col-span-2", "md:col-span-2", "md:col-span-4"];

function FractionVisual() {
  return (
    <div className="flex h-full flex-col justify-center gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="label">Mínimo por orden</p>
          <PriceText value={LANDING_MIN_ORDER_USD} currency="USD" size="md" className="mt-1 block" />
        </div>
        <svg
          viewBox="0 0 30 12"
          aria-hidden="true"
          className="h-3 w-6 shrink-0 text-fg-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1.5 6h23" />
          <path d="M20.5 2.5 24.5 6l-4 3.5" />
        </svg>
        <span className="sr-only">equivale a</span>
        <div className="min-w-0 text-right">
          <p className="label">Ejemplo</p>
          <p className="num mt-1 text-xl leading-none text-fg sm:text-2xl">
            {EXAMPLE_SHARES}
            <span className="ml-1 font-sans text-xs font-normal tracking-normal text-fg-muted">
              acciones
            </span>
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="label">Fracción de 1 acción</p>
          <p className="num text-xs leading-none text-fg">{EXAMPLE_SHARE_FRACTION}</p>
        </div>
        <svg
          viewBox="0 0 100 8"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="mt-2 h-2.5 w-full text-fg"
        >
          <rect width="100" height="8" fill="currentColor" opacity="0.08" />
          <rect width="4.38" height="8" fill="currentColor" />
          <g fill="currentColor" opacity="0.3">
            <rect x="24.85" width="0.3" height="8" />
            <rect x="49.85" width="0.3" height="8" />
            <rect x="74.85" width="0.3" height="8" />
          </g>
        </svg>
        <div className="mt-2 flex items-center justify-between text-xs leading-none text-fg-muted">
          <span className="num">0</span>
          <span className="num">1 acción</span>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-fg-muted">
        Ejemplo, no una cotización: la cantidad de acciones cambia con el precio al confirmar.
      </p>
    </div>
  );
}

function CustodyVisual() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <svg
        viewBox="0 0 120 120"
        aria-hidden="true"
        className="h-auto w-24 text-bg sm:w-28"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Escudo */}
        <path d="M60 9 99 23v31c0 24-16 39-39 50-23-11-39-26-39-50V23L60 9Z" />
        <path d="M60 20 89 30v24c0 17-11 28-29 37-18-9-29-20-29-37V30l29-10Z" strokeOpacity="0.22" />
        {/* Llave: anillo y paletón */}
        <circle cx="60" cy="50" r="10" />
        <circle cx="60" cy="50" r="3.25" strokeOpacity="0.55" />
        <path d="M60 60v22M60 71h10M60 78h8" />
        {/* Marcas del escudo */}
        <circle cx="28" cy="34" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="92" cy="34" r="1.6" fill="currentColor" stroke="none" />
      </svg>
      <div>
        <p className="num text-3xl leading-none text-bg">0%</p>
        <p className="mx-auto mt-3 max-w-[15rem] text-sm font-medium leading-snug text-bg">
          Billetera propia · 0% custodia de terceros
        </p>
      </div>
    </div>
  );
}

function ReceiptVisual() {
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="label">Orden por confirmar</p>
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="size-4 shrink-0 text-fg-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3.75 2.25h8.5v11.5l-2.125-1.4-2.125 1.4-2.125-1.4-2.125 1.4V2.25Z" />
          <path d="M6 5.75h4M6 8.5h4" />
        </svg>
      </div>

      <div className="rounded-xl border border-border bg-surface-1 p-3">
        <ul className="space-y-2 text-sm">
          <li className="flex items-baseline justify-between gap-3">
            <span className="text-fg-body">Monto</span>
            <PriceText value={LANDING_MIN_ORDER_USD} currency="USD" size="sm" />
          </li>
          <li>
            <p className="flex items-center justify-between gap-3 rounded-md bg-up-bg px-2 py-1.5">
              <span className="text-xs font-semibold text-up">0% Comisión</span>
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="size-3.5 shrink-0 text-up"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 8.5 6.4 11.8 13 4.8" />
              </svg>
            </p>
          </li>
          <li className="space-y-0.5">
            <span className="block text-fg-body">Red e impacto</span>
            <span className="block text-xs leading-snug text-fg-muted">se ven al confirmar</span>
          </li>
        </ul>
        <div className="mt-3 flex items-center gap-2.5 border-t border-dashed border-border-strong pt-3">
          <svg
            viewBox="0 0 32 32"
            aria-hidden="true"
            className="size-7 shrink-0 text-fg-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="16" cy="16" r="12.5" strokeDasharray="2.5 3" />
            <path d="M10.5 16.5 14.5 20.5 21.5 11.5" />
          </svg>
          <p className="text-xs leading-relaxed text-fg-muted">
            El total final aparece antes de firmar, no después.
          </p>
        </div>
      </div>
    </div>
  );
}

function FlowVisual() {
  return (
    <div className="flex h-full flex-col justify-center gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="label">Ruta de la orden</p>
        <span className="num rounded-md border border-border px-1.5 py-0.5 text-xs leading-none text-fg-muted">
          24/7
        </span>
      </div>

      <svg
        viewBox="0 0 340 92"
        aria-hidden="true"
        className="mx-auto h-auto w-full max-w-md text-fg"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g strokeOpacity="0.5" vectorEffect="non-scaling-stroke">
          <rect x="0.5" y="26.5" width="92" height="38" rx="8" vectorEffect="non-scaling-stroke" />
          <rect x="123.5" y="26.5" width="92" height="38" rx="8" vectorEffect="non-scaling-stroke" />
          <rect x="246.5" y="26.5" width="92" height="38" rx="8" vectorEffect="non-scaling-stroke" />
        </g>
        <g strokeOpacity="0.75" vectorEffect="non-scaling-stroke">
          <path d="M97 45.5h17" vectorEffect="non-scaling-stroke" />
          <path d="M109 40.5l5.5 5-5.5 5" vectorEffect="non-scaling-stroke" />
          <path d="M220 45.5h17" vectorEffect="non-scaling-stroke" />
          <path d="M232 40.5l5.5 5-5.5 5" vectorEffect="non-scaling-stroke" />
        </g>
        <g fill="currentColor" stroke="none" fontSize="12" textAnchor="middle">
          <text x="46.5" y="50">Chile</text>
          <text x="169.5" y="50">Solana 24/7</text>
          <text x="292.5" y="50">xStocks</text>
        </g>
        <g fill="currentColor" stroke="none" opacity="0.4">
          <rect x="40" y="70" width="13" height="1.5" />
          <rect x="163" y="70" width="13" height="1.5" />
          <rect x="286" y="70" width="13" height="1.5" />
        </g>
      </svg>

      <p className="text-xs leading-relaxed text-fg-muted">
        Directo: sin corredora de EE.UU. y sin intermediarios tradicionales.
      </p>
    </div>
  );
}

const features: { title: string; body: string; visual: ReactNode }[] = [
  {
    // Piso de producto, el mismo del hero (LANDING_MIN_ORDER_USD, en dólares). No es una cifra de mercado.
    title: `Fracciones desde US$${LANDING_MIN_ORDER_USD}`,
    body: "Puedes comprar una parte de la acción, no el papel entero. Queda en tu propia billetera —nosotros no custodiamos tus activos— y operas 24/7.",
    visual: <FractionVisual />,
  },
  {
    // TODO-VERIFICAR: autocustodia. Exportar la clave está en el diseño de perfil, marcado [según Privy].
    title: "Tus activos, en tu propia billetera",
    body: "El token es tuyo y queda en la billetera de tu cuenta. El modelo exacto de la clave sigue en revisión.",
    visual: <CustodyVisual />,
  },
  {
    // ARQUITECTURA §6.3: la comisión se muestra siempre en el desglose, antes de confirmar.
    title: "Costos claros antes de confirmar",
    body: "Ves comisión, red e impacto de mercado antes de aceptar la orden.",
    visual: <ReceiptVisual />,
  },
  {
    // Hay onboarding (país, declaración y términos). No hay cuenta en un broker de EE.UU.
    title: "Sin cuenta en una corredora de EE.UU.",
    body: "No abres una cuenta en una corredora de Estados Unidos. Sí aceptas términos al crear la tuya.",
    visual: <FlowVisual />,
  },
];

export function FeatureGrid() {
  return (
    <LandingSection titleId="idea-title">
      <Reveal>
        <SectionIntro id="idea-title" title="Fracciones, con los costos a la vista">
          Cuatro reglas de {site.name}. Ninguna es una promesa de ganancia.
        </SectionIntro>
      </Reveal>

      <div className="mt-10 grid grid-cols-1 gap-3 sm:gap-4 md:mt-14 md:grid-cols-6">
        {features.map((feature, index) => {
          const Glyph = glyphs[index] ?? IconChart;
          // Una sola tarjeta invertida rompe la grilla plana y da el contraste del bento.
          const inverted = index === 1;

          return (
            <Reveal
              key={feature.title}
              delay={(index + 1) * REVEAL_STAGGER_MS}
              className={cn("h-full", spans[index])}
            >
              <Card
                className={cn(
                  "flex h-full flex-col rounded-3xl p-0 md:p-0",
                  inverted ? "border border-fg bg-fg text-bg shadow-none" : undefined,
                )}
              >
                <div className="flex h-full flex-col p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={cn(
                        "inline-flex size-9 shrink-0 items-center justify-center rounded-xl border",
                        inverted ? "border-bg/20 bg-bg/10 text-bg" : "border-border bg-bg text-fg",
                      )}
                    >
                      <Glyph className="size-4" />
                    </span>
                    <span
                      className={cn(
                        "num text-xs leading-none tracking-[0.06em]",
                        inverted ? "text-bg/50" : "text-fg-muted",
                      )}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="mt-4">
                    <h3 className={cn("text-lg leading-snug text-pretty", inverted && "text-bg")}>
                      {feature.title}
                    </h3>
                    <p
                      className={cn(
                        "mt-2 text-sm leading-relaxed text-pretty",
                        inverted ? "text-bg/70" : "text-fg-body",
                      )}
                    >
                      {feature.body}
                    </p>
                  </div>

                  <div className="mt-5 flex-1" />

                  <div
                    className={cn(
                      "rounded-2xl border p-4 lg:p-5",
                      inverted ? "border-bg/20 bg-bg/5" : "border-border bg-bg",
                    )}
                  >
                    {feature.visual}
                  </div>
                </div>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </LandingSection>
  );
}

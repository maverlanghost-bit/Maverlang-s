import type * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Accesos rápidos del estado vacío del asistente (T58 · BOT 05).
 * Clon de `welcome-popup` de ai-chat-extracted en un solo módulo sin
 * dependencias: sólo entrega prompts, no llama a la red.
 * Los glifos son SVG locales para no depender de lucide-react.
 *
 * T61: se retiró el bloque «Sugerencias» (`PromptSuggestions`) que vivía bajo
 * los chips; el estado vacío usa únicamente `WelcomeChips`.
 */

export type WelcomeAction = {
  id: string;
  label: string;
  title?: string;
  prompt: string;
  tone: "brand" | "up" | "info" | "warn";
};

export const WELCOME_ACTIONS: readonly WelcomeAction[] = [
  {
    id: "daily-summary",
    title: "Resumen de hoy",
    label: "Resumen del día",
    prompt:
      "Dame el resumen de hoy: qué acciones del catálogo suben y bajan más y cómo va el mercado. Sólo datos, sin recomendaciones.",
    tone: "info",
  },
  {
    id: "portfolio-review",
    title: "¿Cómo está mi cartera?",
    label: "Analizar tu portafolio",
    prompt:
      "Analiza mi portafolio con las cotizaciones en vivo. Dame un resumen del rendimiento, las posiciones que más suben y bajan, el riesgo actual y una recomendación concreta.",
    tone: "brand",
  },
  {
    id: "portfolio-create",
    title: "Simular aporte en Tesla",
    label: "Crear un portafolio",
    prompt:
      "Simula un aporte de 500 USD en Tesla (TSLAx). Explica cómo diversificarlo y los riesgos clave.",
    tone: "up",
  },
  {
    id: "market-news",
    title: "Gráfico de Nvidia",
    label: "Noticias del mercado",
    prompt:
      "Muestra el gráfico interactivo y precio en vivo de NVDAx, junto con sus principales catalizadores y noticias.",
    tone: "info",
  },
  {
    id: "investment-strategy",
    title: "Comparar Apple vs Microsoft",
    label: "Estrategia de inversión",
    prompt:
      "Compara Apple (AAPLx) y Microsoft (MSFTx) lado a lado: múltiplos, valuación, crecimiento y rendimiento reciente.",
    tone: "warn",
  },
];

type IconProps = { className?: string };

const SVG_BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: "false",
} as const satisfies React.SVGProps<SVGSVGElement>;

function BriefcaseIcon({ className }: IconProps): React.ReactElement {
  return (
    <svg {...SVG_BASE} className={className}>
      <path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M9 6.5V5.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" />
      <path d="M3.5 11.5h17" />
      <path d="M10.5 11.5v2h3v-2" />
    </svg>
  );
}

function PlusCircleIcon({ className }: IconProps): React.ReactElement {
  return (
    <svg {...SVG_BASE} className={className}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

function LineChartIcon({ className }: IconProps): React.ReactElement {
  return (
    <svg {...SVG_BASE} className={className}>
      <path d="M3 3v18h18" />
      <path d="M6.5 15.5 11 11l3.5 3.5L20 8" />
      <path d="M15.5 8H20v4.5" />
    </svg>
  );
}

function ScaleIcon({ className }: IconProps): React.ReactElement {
  return (
    <svg {...SVG_BASE} className={className}>
      <path d="M12 3v18M7 21h10M4 7h16" />
      <path d="M7 7l-3 6a3 3 0 0 0 6 0L7 7ZM17 7l-3 6a3 3 0 0 0 6 0l-3-6Z" />
    </svg>
  );
}

function SparkIcon({ className }: IconProps): React.ReactElement {
  return (
    <svg {...SVG_BASE} className={className}>
      <path d="M12 3.5l1.9 4.9 4.9 1.9-4.9 1.9L12 17.1l-1.9-4.9-4.9-1.9 4.9-1.9z" />
      <path d="M18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </svg>
  );
}

/** Sol: el resumen del día. */
function SunIcon({ className }: IconProps): React.ReactElement {
  return (
    <svg {...SVG_BASE} className={className}>
      <circle cx="12" cy="12" r="3.75" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18" />
    </svg>
  );
}

function actionIcon(id: string): (props: IconProps) => React.ReactElement {
  switch (id) {
    case "daily-summary":
      return SunIcon;
    case "portfolio-review":
      return BriefcaseIcon;
    case "portfolio-create":
      return PlusCircleIcon;
    case "market-news":
      return LineChartIcon;
    case "investment-strategy":
      return ScaleIcon;
    default:
      return SparkIcon;
  }
}

export function WelcomeChips({
  onSendMessage,
}: {
  onSendMessage: (prompt: string) => void;
}): React.ReactElement {
  return (
    <div
      role="group"
      aria-label="Acciones rápidas"
      data-welcome-chips=""
      className="w-full max-w-3xl px-1 grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center lg:justify-center gap-2"
    >
      {WELCOME_ACTIONS.map((action) => {
        const Icon = actionIcon(action.id);

        return (
          <button
            key={action.id}
            type="button"
            data-welcome-action={action.id}
            onClick={() => onSendMessage(action.prompt)}
            className={cn(
              "group flex items-center gap-2.5 text-left",
              "px-3.5 py-2.5 rounded-2xl lg:rounded-full",
              "bg-white/90 border border-border/70 shadow-2xs backdrop-blur-xs",
              "hover:border-border hover:bg-surface-1 hover:shadow-xs",
              "transition-all duration-200 cursor-pointer active:scale-[0.98]",
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-zinc-600 transition-colors group-hover:bg-white group-hover:text-zinc-950 shadow-2xs border border-border/40">
              <Icon className="size-3.5" />
            </span>
            <div className="flex flex-col min-w-0 pr-1">
              <span className="text-[12.5px] font-semibold text-zinc-900 leading-snug truncate">
                {action.title ?? action.label}
              </span>
              <span className="text-[11px] text-zinc-500 leading-none truncate">
                {action.label}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}


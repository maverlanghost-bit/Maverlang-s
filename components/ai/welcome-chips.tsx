import type * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Accesos rápidos del estado vacío del asistente (T58 · BOT 05).
 * Clon de `welcome-popup` y `prompt-suggestions` de ai-chat-extracted en un
 * solo módulo sin dependencias: sólo entrega prompts, no llama a la red.
 * Los glifos son SVG locales para no depender de lucide-react.
 */

export type WelcomeAction = {
  id: string;
  label: string;
  prompt: string;
  tone: "brand" | "up" | "info" | "warn";
};

export const WELCOME_ACTIONS: readonly WelcomeAction[] = [
  {
    id: "portfolio-review",
    label: "Analizar tu portafolio",
    prompt:
      "Analiza mi portafolio con las cotizaciones en vivo. Dame un resumen del rendimiento, las posiciones que más suben y bajan, el riesgo actual y una recomendación concreta.",
    tone: "brand",
  },
  {
    id: "portfolio-create",
    label: "Crear un portafolio",
    prompt:
      "Ayúdame a crear un portafolio desde cero con acciones tokenizadas. Pregúntame por mi perfil de riesgo, horizonte temporal y capital inicial, y propón una cartera concreta con porcentajes por acción, el motivo de cada posición y cómo diversificarla.",
    tone: "up",
  },
  {
    id: "market-news",
    label: "Noticias del mercado",
    prompt:
      "Dame un resumen de las noticias financieras más importantes de hoy. Incluye los principales movimientos del mercado, eventos corporativos relevantes y su impacto potencial.",
    tone: "info",
  },
  {
    id: "investment-strategy",
    label: "Estrategia de inversión",
    prompt:
      "Ayúdame a crear una estrategia de inversión. Pregúntame sobre mi perfil de riesgo, horizonte temporal, capital disponible y objetivos. Dame un plan diversificado con porcentajes.",
    tone: "warn",
  },
];

export type PromptSuggestion = {
  id: string;
  label: string;
  description: string;
  prompt: string;
};

export const PROMPT_SUGGESTIONS: readonly PromptSuggestion[] = [
  {
    id: "portfolio",
    label: "Mi portafolio",
    description: "Analiza el rendimiento de tus acciones",
    prompt:
      "Muéstrame cómo va mi portafolio hoy. Dame un resumen del rendimiento, las acciones que más subieron y bajaron, y una recomendación general.",
  },
  {
    id: "news",
    label: "Noticias del mercado",
    description: "Resumen de noticias financieras",
    prompt:
      "Dame un resumen de las noticias financieras más importantes de hoy. Incluye los principales movimientos del mercado, eventos corporativos relevantes y su impacto potencial.",
  },
  {
    id: "technical",
    label: "Análisis técnico",
    description: "Analiza una acción en detalle",
    prompt:
      "Necesito un análisis técnico detallado. Pregúntame qué acción quiero analizar, y luego dame niveles de soporte/resistencia, tendencias, y señales de compra/venta.",
  },
  {
    id: "compare",
    label: "Comparar acciones",
    description: "Compara el rendimiento de varias acciones",
    prompt:
      "Quiero comparar acciones. Pregúntame cuáles quiero comparar, y luego dame una tabla comparativa con métricas clave como P/E, rendimiento, dividendos y recomendación.",
  },
  {
    id: "strategy",
    label: "Estrategia de inversión",
    description: "Genera un plan de inversión personalizado",
    prompt:
      "Ayúdame a crear una estrategia de inversión. Pregúntame sobre mi perfil de riesgo, horizonte temporal, capital disponible y objetivos. Dame un plan diversificado con porcentajes.",
  },
  {
    id: "alerts",
    label: "Alertas de precio",
    description: "Configura alertas para tus acciones",
    prompt:
      "Quiero configurar alertas de precio para mis acciones. Muéstrame mis posiciones actuales y ayúdame a establecer niveles de alerta para cada una.",
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

function NewspaperIcon({ className }: IconProps): React.ReactElement {
  return (
    <svg {...SVG_BASE} className={className}>
      <path d="M4 6.75A1.75 1.75 0 0 1 5.75 5h8.5A1.75 1.75 0 0 1 16 6.75V19H6a2 2 0 0 1-2-2z" />
      <path d="M16 9.5h2.25A1.75 1.75 0 0 1 20 11.25V17a2 2 0 0 1-2 2h-2" />
      <path d="M7 9h6M7 12.5h6M7 16h3.5" />
    </svg>
  );
}

function TargetIcon({ className }: IconProps): React.ReactElement {
  return (
    <svg {...SVG_BASE} className={className}>
      <circle cx="12" cy="12" r="8.25" />
      <circle cx="12" cy="12" r="4.25" />
      <circle cx="12" cy="12" r="0.9" />
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

function ZapIcon({ className }: IconProps): React.ReactElement {
  return (
    <svg {...SVG_BASE} className={className}>
      <path d="M13.4 2.5 4.9 13.4h5.9L9.4 21.5l8.7-11.2h-5.9z" />
    </svg>
  );
}

function actionIcon(id: string): (props: IconProps) => React.ReactElement {
  switch (id) {
    case "portfolio-review":
      return BriefcaseIcon;
    case "portfolio-create":
      return PlusCircleIcon;
    case "market-news":
      return NewspaperIcon;
    case "investment-strategy":
      return TargetIcon;
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
      className="w-full max-w-2xl px-1 grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:justify-center"
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
              "flex items-center gap-1.5 text-left md:text-center",
              "px-3 py-2.5 md:py-1.5 rounded-2xl md:rounded-full",
              "text-[12px] font-medium leading-tight",
              "border border-zinc-200",
              "text-zinc-600",
              "bg-white/80",
              "hover:text-zinc-900",
              "hover:bg-zinc-100",
              "hover:border-zinc-300",
              "transition-all duration-200 cursor-pointer active:scale-95",
              "md:whitespace-nowrap",
            )}
          >
            <Icon className="w-3.5 h-3.5 opacity-70 shrink-0" />
            <span className="min-w-0">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PromptSuggestions({
  onSendMessage,
}: {
  onSendMessage: (prompt: string) => void;
}): React.ReactElement {
  return (
    <div
      data-prompt-suggestions=""
      className="max-w-2xl mx-auto w-full mt-4 md:mt-2 px-6 md:px-0"
    >
      <div className="flex items-center gap-2 mb-2 text-sm text-zinc-500">
        <ZapIcon className="h-4 w-4" />
        <span>Sugerencias</span>
      </div>
      <div className="max-h-46 overflow-y-auto scrollbar-hide">
        {PROMPT_SUGGESTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            data-prompt-suggestion={s.id}
            onClick={() => onSendMessage(s.prompt)}
            className="w-full text-left rounded-md px-3 py-2 hover:bg-zinc-100/80 transition-colors cursor-pointer"
          >
            <div className="font-medium text-zinc-900 text-[14px]">{s.label}</div>
            <div className="text-sm text-zinc-500">{s.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

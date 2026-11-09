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


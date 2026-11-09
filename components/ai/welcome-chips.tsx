"use client";

import type * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Accesos rápidos del estado vacío del asistente (T58 · BOT 05).
 * Une el `welcome-popup` y `prompt-suggestions` de la referencia en un solo
 * módulo sin dependencias: sólo entrega prompts, no llama a la red.
 * Todo el texto vive en el markup, así que SSR y el primer render coinciden.
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
    prompt: "Analiza mi portafolio actual: distribución, riesgo y oportunidades de mejora.",
    tone: "brand",
  },
  {
    id: "portfolio-create",
    label: "Crear un portafolio",
    prompt:
      "Ayúdame a armar un portafolio diversificado con acciones tokenizadas según mi perfil.",
    tone: "up",
  },
  {
    id: "market-news",
    label: "Noticias del mercado",
    prompt:
      "¿Cuáles son los movimientos más relevantes hoy en las acciones disponibles en Maverlang?",
    tone: "info",
  },
  {
    id: "investment-strategy",
    label: "Estrategia de inversión",
    prompt: "Explícame cómo comparar dos acciones usando múltiplos y desempeño reciente.",
    tone: "warn",
  },
];

export type PromptSuggestion = { id: string; label: string; prompt: string };

export const PROMPT_SUGGESTIONS: readonly PromptSuggestion[] = [
  {
    id: "portfolio",
    label: "Mi portafolio",
    prompt: "¿Cómo va mi portafolio hoy? Analiza concentración y riesgo.",
  },
  {
    id: "news",
    label: "Noticias del mercado",
    prompt: "Resume las noticias más relevantes del mercado de hoy.",
  },
  {
    id: "technical",
    label: "Análisis técnico",
    prompt: "Haz un análisis técnico simple de NVDAx en el último mes.",
  },
  {
    id: "compare",
    label: "Comparar acciones",
    prompt: "Compara Apple y Microsoft en valuación y desempeño reciente.",
  },
  {
    id: "strategy",
    label: "Estrategia de inversión",
    prompt: "Explícame una estrategia de inversión diversificada para empezar.",
  },
  {
    id: "alerts",
    label: "Alertas de precio",
    prompt: "¿Cómo configuro una alerta de precio para Tesla?",
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

function ArrowUpRightIcon({ className }: IconProps): React.ReactElement {
  return (
    <svg {...SVG_BASE} className={className}>
      <path d="M6.75 17.25 17.25 6.75" />
      <path d="M8.75 6.75h8.5v8.5" />
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

const TONE_BUBBLE: Record<WelcomeAction["tone"], string> = {
  brand: "bg-brand text-bg",
  up: "bg-up-bg text-up",
  info: "bg-info-bg text-info",
  warn: "bg-warn-bg text-warn",
};

const CHIP_CLASS =
  "inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-xs font-medium text-fg-body transition hover:bg-surface-1 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:outline-none sm:text-sm";

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
      className="flex w-full flex-wrap items-center justify-center gap-2"
    >
      {WELCOME_ACTIONS.map((action) => {
        const Icon = actionIcon(action.id);

        return (
          <button
            key={action.id}
            type="button"
            data-welcome-action={action.id}
            onClick={() => onSendMessage(action.prompt)}
            className={cn(CHIP_CLASS)}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full",
                TONE_BUBBLE[action.tone],
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="whitespace-nowrap">{action.label}</span>
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
    <div data-prompt-suggestions="" className="w-full">
      <div className="flex items-center gap-1.5 px-1 pb-1.5">
        <ZapIcon className="size-3.5 text-fg-muted" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
          Sugerencias
        </span>
      </div>
      <ul className="flex list-none flex-col gap-0.5">
        {PROMPT_SUGGESTIONS.map((suggestion) => (
          <li key={suggestion.id}>
            <button
              type="button"
              data-prompt-suggestion={suggestion.id}
              onClick={() => onSendMessage(suggestion.prompt)}
              className="group flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] text-fg-body transition hover:bg-surface-1 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:outline-none"
            >
              <span className="min-w-0 truncate">{suggestion.label}</span>
              <ArrowUpRightIcon className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

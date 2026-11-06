"use client";

import { cn } from "@/lib/cn";

/** Modo de razonamiento del asistente. Lo consume el compositor. */
export type AiReasoningMode = "flash" | "deep" | "portfolio";

/** Límite duro de texto que acepta el compositor (caracteres). */
export const MAX_TEXT = 4000;

/** Prefijo sutil que se añade al prompt cuando el modo es DeepThink. */
export const DEEP_PREFIX = "[DeepThink] ";

type ReasoningOption = {
  value: AiReasoningMode;
  emoji: string;
  label: string;
  hint: string;
};

const OPTIONS: readonly ReasoningOption[] = [
  { value: "flash", emoji: "⚡", label: "Flash", hint: "Respuestas concisas y rápidas" },
  {
    value: "deep",
    emoji: "🧠",
    label: "DeepThink",
    hint: "Análisis estructurado a fondo: contexto, datos y riesgos",
  },
  {
    value: "portfolio",
    emoji: "📊",
    label: "Cartera X-Ray",
    hint: "Enfoque en composición y métricas de portafolio",
  },
];

/**
 * Selector de modo de razonamiento estilo x.ai: tres píldoras compactas.
 * Puro render, sin `window`/`document` (SSR seguro).
 */
export function ReasoningModeBar({
  mode,
  onChange,
}: {
  mode: AiReasoningMode;
  onChange: (mode: AiReasoningMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Modo de razonamiento"
      className="flex min-w-0 flex-wrap items-center gap-1.5"
    >
      {OPTIONS.map((option) => {
        const active = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={`${option.label}: ${option.hint}`}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium leading-none outline-none",
              "transition duration-[160ms] ease-[var(--ease-inout)] motion-reduce:transition-none",
              "focus-visible:ring-4 focus-visible:ring-fg/15",
              "active:scale-[0.98] motion-reduce:active:scale-100",
              active
                ? "border border-transparent bg-fg text-bg shadow-card hover:bg-fg"
                : "border border-border/70 bg-white text-fg-muted hover:bg-surface-1 hover:text-fg",
            )}
          >
            <span aria-hidden="true" className="text-[13px] leading-none">
              {option.emoji}
            </span>
            <span className="whitespace-nowrap">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Utilidad pura: aplica el prefijo de DeepThink una sola vez y respeta `MAX_TEXT`.
 * - `deep`: antepone `[DeepThink] ` si aún no está presente.
 * - `flash` / `portfolio`: devuelve el texto tal cual (sólo recorta espacios finales).
 * El resultado nunca supera `MAX_TEXT`.
 */
export function applyReasoningPrefix(text: string, mode: AiReasoningMode): string {
  const trimmed = text.replace(/\s+$/, "");

  if (mode !== "deep") {
    return trimmed.length > MAX_TEXT ? trimmed.slice(0, MAX_TEXT) : trimmed;
  }

  const base = trimmed.trimStart();

  if (base.toLowerCase().startsWith(DEEP_PREFIX.trim().toLowerCase())) {
    return base.length > MAX_TEXT ? base.slice(0, MAX_TEXT) : base;
  }

  const room = MAX_TEXT - DEEP_PREFIX.length;
  const body = base.slice(0, room).replace(/\s+$/, "");
  if (!body) return DEEP_PREFIX.trimEnd();
  return DEEP_PREFIX + body;
}

"use client";

import { cn } from "@/lib/cn";

/**
 * Cinta de "pulso de mercado" del asistente.
 * Chips táctiles con análisis rápido; no llama a la red: sólo entrega el prompt.
 * Sin `window` ni estado: renderiza igual en SSR.
 */

type PulsePrompt = {
  id: string;
  label: string;
  emoji: string;
  prompt: string;
};

const PULSE_PROMPTS: readonly PulsePrompt[] = [
  {
    id: "nvda-pulse",
    label: "Pulso NVDAx hoy",
    emoji: "⚡",
    prompt: "Analiza cómo va NVDAx hoy, su tendencia y riesgos clave",
  },
  {
    id: "spy-qqq",
    label: "S&P 500 vs Nasdaq (SPYx vs QQQx)",
    emoji: "📊",
    prompt: "Compara SPYx y QQQx en el último mes",
  },
  {
    id: "portfolio-xray",
    label: "Radiografía de mi Cartera",
    emoji: "🧠",
    prompt: "¿Cómo va mi cartera? Analiza pesos y diversificación",
  },
  {
    id: "xstocks-247",
    label: "Qué son los xStocks 24/7",
    emoji: "💎",
    prompt:
      "Explica cómo funcionan las acciones tokenizadas xStocks 24/7 en Solana y sus riesgos",
  },
];

const CHIP_CLASS =
  "inline-flex min-h-11 shrink-0 snap-start touch-manipulation items-center gap-2 rounded-full border border-border/70 bg-white px-4 text-[13px] font-medium text-fg-body outline-none transition duration-200 ease-[var(--ease-inout)] hover:border-fg/20 hover:bg-surface-1 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:ring-offset-0 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none sm:text-sm";

export function MarketPulseBar({
  onSelectPrompt,
}: {
  onSelectPrompt: (text: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Análisis rápido del mercado"
      data-market-pulse=""
      className="flex w-full min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto px-1 py-1 no-scrollbar [scroll-padding-inline:0.25rem]"
    >
      {PULSE_PROMPTS.map((item) => (
        <button
          key={item.id}
          type="button"
          data-prompt={item.prompt}
          onClick={() => onSelectPrompt(item.prompt)}
          className={cn(CHIP_CLASS)}
        >
          <span aria-hidden="true" className="text-base leading-none">
            {item.emoji}
          </span>
          <span className="whitespace-nowrap">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

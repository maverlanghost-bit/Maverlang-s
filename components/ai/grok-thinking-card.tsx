"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/cn";

/** Pasos de telemetría que se muestran mientras el asistente razona. */
const TELEMETRY_STEPS = [
  "Consultando precios spot en Solana…",
  "Verificando liquidez y series históricas…",
  "Sintetizando análisis financiero xStocks…",
] as const;

const STEP_INTERVAL_MS = 1200;

type GrokThinkingMode = "flash" | "deep" | "portfolio";

const MODE_BADGE: Record<GrokThinkingMode, string> = {
  flash: "Flash",
  deep: "DeepThink",
  portfolio: "Cartera X-Ray",
};

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(REDUCED_QUERY).matches;
}

/** Preferencia de movimiento reducido, leída fuera del cuerpo del efecto. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
}

/**
 * Indicador de razonamiento en vivo (estilo Grok 3 DeepSearch) para el
 * asistente. Cicla los pasos de telemetría cada 1200 ms, salvo que el usuario
 * prefiera movimiento reducido: en ese caso queda fijo en el primer paso.
 *
 * Es seguro en SSR: el primer render no toca `window`; la preferencia de
 * movimiento se lee con `useSyncExternalStore` (snapshot de servidor `false`).
 */
export function GrokThinkingCard({
  label,
  mode = "flash",
}: {
  label: string;
  mode?: GrokThinkingMode;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;

    const id = window.setInterval(() => {
      setStepIndex((prev) => (prev + 1) % TELEMETRY_STEPS.length);
    }, STEP_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [reducedMotion]);

  const activeIndex = reducedMotion ? 0 : stepIndex;
  const step = TELEMETRY_STEPS[activeIndex];

  return (
    <div
      data-ai-thinking={mode}
      className={cn(
        "rounded-2xl border border-border/70 bg-bg-elevated/80 px-3.5 py-3 backdrop-blur",
        "motion-safe:animate-fade-in motion-reduce:animate-none",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="relative flex size-2 shrink-0 items-center justify-center">
          <span className="absolute inset-[-3px] rounded-full bg-brand/30 motion-safe:animate-ping motion-reduce:animate-none" />
          <span className="relative size-2 rounded-full bg-brand motion-safe:animate-pulse motion-reduce:animate-none" />
        </span>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="min-w-0 text-[12.5px] leading-snug font-medium text-fg-body"
        >
          {label}
        </p>
        <span className="ml-auto shrink-0 rounded-full border border-border/60 bg-surface-1 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-fg-muted uppercase">
          {MODE_BADGE[mode]}
        </span>
      </div>

      <div aria-hidden="true" className="mt-2 flex items-center gap-2.5">
        <span className="flex items-center gap-1">
          {TELEMETRY_STEPS.map((_, index) => (
            <span
              key={index}
              className={cn(
                "h-[3px] rounded-full transition-colors duration-300 ease-[var(--ease-inout)] motion-reduce:transition-none",
                index === activeIndex ? "w-4 bg-brand" : "w-1.5 bg-border",
              )}
            />
          ))}
        </span>
        <span className="min-w-0 truncate text-[11.5px] leading-snug text-fg-muted tabular-nums">
          {step}
        </span>
      </div>
    </div>
  );
}

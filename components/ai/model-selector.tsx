"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";

import { cn } from "@/lib/cn";

type AiModelId = "fast" | "pro";

type AiModel = {
  id: AiModelId;
  name: string;
  badge: string;
  description: string;
};

const FAST_MODEL: AiModel = {
  id: "fast",
  name: "Maverlang v2.5",
  badge: "Rápido",
  description: "Respuestas veloces para consultas de mercado y portafolio",
};

const PRO_MODEL: AiModel = {
  id: "pro",
  name: "Maverlang v2.5 Pro",
  badge: "Pro",
  description: "Razonamiento profundo multi-agente y análisis financiero detallado",
};

export const AI_MODELS: readonly AiModel[] = [FAST_MODEL, PRO_MODEL];

type IconProps = { className?: string };

function IconZap({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" className={cn("size-3.5", className)}>
      <path
        d="M9.3 1.7 3.6 9.2h3.8l-.7 5.1 5.7-7.5H8.5l.8-5.1Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBrain({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" className={cn("size-3.5", className)}>
      <path
        d="M8 2.9c-1 0-1.9.6-2.2 1.5-.9 0-1.7.8-1.7 1.7 0 .3.1.6.2.9-.5.3-.8.8-.8 1.4 0 .9.6 1.6 1.5 1.8.1.9.8 1.5 1.7 1.5.2 0 .4 0 .6-.1.4-.2.7-.5.7-.9V2.9Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M8 2.9c1 0 1.9.6 2.2 1.5.9 0 1.7.8 1.7 1.7 0 .3-.1.6-.2.9.5.3.8.8.8 1.4 0 .9-.6 1.6-1.5 1.8-.1.9-.8 1.5-1.7 1.5-.2 0-.4 0-.6-.1-.4-.2-.7-.5-.7-.9V2.9Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M6.4 6.4h1.1M8.5 6.4h1.1M6.6 9.2h.9M8.5 9.2h.9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function IconChevronDown({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" className={cn("size-3", className)}>
      <path
        d="M4 6.25 8 10.25l4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCheck({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" className={cn("size-4", className)}>
      <path
        d="M3.5 8.4 6.4 11.3 12.5 4.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ModelIcon({ id, className }: { id: AiModelId; className?: string }) {
  return id === "pro" ? <IconBrain className={className} /> : <IconZap className={className} />;
}

/**
 * Selector de modelo del asistente (Maverlang v2.5 / v2.5 Pro).
 * Controlado: el modelo activo sale de `selectedModel` (default "fast").
 * El menú sólo se monta al abrirse, así que en SSR únicamente se ve la píldora.
 */
export function ModelSelector({
  selectedModel = "fast",
  onSelectModel,
  variant = "header",
  className,
}: {
  selectedModel?: AiModelId;
  onSelectModel?: (model: AiModelId) => void;
  variant?: "header" | "inline";
  className?: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();

  const selected = selectedModel === "pro" ? PRO_MODEL : FAST_MODEL;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      if (container && event.target instanceof Node && container.contains(event.target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const choose = (id: AiModelId) => {
    onSelectModel?.(id);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={cn("relative shrink-0", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label="Elegir modelo"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-white font-medium leading-none text-fg-body outline-none",
          "transition-colors duration-150 hover:bg-surface-1 hover:text-fg motion-reduce:transition-none",
          "focus-visible:ring-4 focus-visible:ring-fg/20",
          variant === "inline" ? "h-7 px-2 text-[11.5px]" : "h-8 px-2.5 text-xs",
          open && "bg-surface-1 text-fg",
        )}
      >
        <ModelIcon id={selected.id} className="shrink-0" />
        <span className="whitespace-nowrap">{selected.name}</span>
        <IconChevronDown
          className={cn(
            "shrink-0 text-fg-muted transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Modelos disponibles"
          className={cn(
            "absolute left-0 z-50 w-64 rounded-2xl border border-border bg-white p-1.5 shadow-[0_18px_40px_-24px_rgba(12,15,20,0.35)]",
            variant === "inline" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {AI_MODELS.map((model) => {
            const active = model.id === selected.id;
            return (
              <button
                key={model.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => choose(model.id)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left outline-none transition-colors duration-150",
                  "hover:bg-surface-1 focus-visible:ring-4 focus-visible:ring-fg/15 motion-reduce:transition-none",
                  active && "bg-surface-1",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                    model.id === "pro" ? "bg-fg text-bg" : "bg-surface-2 text-fg-body",
                  )}
                >
                  <ModelIcon id={model.id} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-fg">{model.name}</span>
                    <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium leading-none text-fg-muted">
                      {model.badge}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-fg-muted">{model.description}</span>
                </span>
                {active ? <IconCheck className="mt-1 shrink-0 text-fg" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

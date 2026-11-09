"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";

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
  description: "Respuestas rápidas y precisas (Por defecto)",
};

const PRO_MODEL: AiModel = {
  id: "pro",
  name: "Maverlang v2.5 Pro",
  badge: "Pro",
  description: "Análisis financiero profundo y razonamiento reflexivo",
};

export const AI_MODELS: readonly AiModel[] = [FAST_MODEL, PRO_MODEL];

type IconProps = { className?: string };

function IconSparkles({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" className={cn("size-3", className)}>
      <path
        d="M6.6 1.9 7.72 4.9 10.7 6.02 7.72 7.14 6.6 10.14 5.48 7.14 2.5 6.02 5.48 4.9 6.6 1.9Z"
        fill="currentColor"
      />
      <path
        d="M11.9 8.9l.7 1.85 1.85.7-1.85.7-.7 1.85-.7-1.85-1.85-.7 1.85-.7.7-1.85Z"
        fill="currentColor"
      />
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

function CheckIcon({ className }: IconProps) {
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
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  const selected = selectedModel === "pro" ? PRO_MODEL : FAST_MODEL;

  const closeAndFocusTrigger = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const choose = useCallback(
    (id: AiModelId) => {
      onSelectModel?.(id);
      closeAndFocusTrigger();
    },
    [closeAndFocusTrigger, onSelectModel],
  );

  const openMenu = useCallback(() => {
    const index = AI_MODELS.findIndex((model) => model.id === selected.id);
    setActiveIndex(index === -1 ? 0 : index);
    setOpen(true);
  }, [selected.id]);

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

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (open) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openMenu();
  };

  const handleListboxKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + delta + AI_MODELS.length) % AI_MODELS.length);
      return;
    }

    if (event.key === "Enter") {
      const model = AI_MODELS[activeIndex];
      if (!model) return;
      event.preventDefault();
      choose(model.id);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative shrink-0", variant === "header" && "hidden md:block", className)}
    >
      {variant === "inline" ? (
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-label="Elegir modelo"
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={handleTriggerKeyDown}
          className="w-fit h-7 inline-flex items-center gap-1 bg-transparent hover:bg-zinc-100 hover:text-black px-2 rounded-lg text-xs font-normal text-black cursor-pointer shrink-0 shadow-none outline-none"
        >
          <span className="hidden md:inline">{selected.name}</span>
          <span className="inline md:hidden">{selected.id === "pro" ? "v2.5 Pro" : "v2.5"}</span>
          <IconChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-label="Elegir modelo"
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={handleTriggerKeyDown}
          className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border border-zinc-200/80 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 shrink-0 cursor-pointer"
        >
          <IconSparkles className="w-3 h-3 text-[#1890FF]" />
          <span>{selected.name}</span>
          <IconChevronDown
            className={cn(
              "size-3 text-zinc-400 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      )}

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Modelos disponibles"
          onKeyDown={handleListboxKeyDown}
          className={cn(
            "absolute w-[280px] rounded-2xl border border-gray-200/60 bg-white p-1.5 shadow-xl z-50",
            variant === "inline" ? "bottom-full right-0 mb-2" : "top-full left-0 mt-1.5",
          )}
        >
          {AI_MODELS.map((model, index) => {
            const active = model.id === selected.id;
            return (
              <button
                key={model.id}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="option"
                aria-selected={active}
                tabIndex={-1}
                onClick={() => choose(model.id)}
                className="w-full py-2 px-3 rounded-xl flex items-center justify-between text-left hover:bg-zinc-100 transition-colors cursor-pointer outline-none focus-visible:bg-zinc-100"
              >
                <div>
                  <div className="font-bold text-xs text-zinc-900">
                    {model.name}
                    <span className="ml-1.5 inline-flex items-center rounded-full border border-zinc-200 px-1.5 py-0.5 text-[9px] font-medium leading-none text-zinc-500 align-middle">
                      {model.badge}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate mt-0.5">{model.description}</div>
                </div>
                {active ? <CheckIcon className="h-4 w-4 ml-auto text-teal-600 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

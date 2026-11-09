"use client";

import { useId, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { cn } from "@/lib/cn";

export type InteractiveQuestionOption = {
  id: string;
  label: string;
  description?: string;
};

export type InteractiveQuestionData = {
  id: string;
  question: string;
  options: InteractiveQuestionOption[];
  allowCustom?: boolean;
};

/** Clave interna para la opción de texto libre; nunca colisiona con un id real. */
const CUSTOM_OPTION_ID = "__custom__";

function Icon({ children, className }: { children: ReactNode; className?: string }): ReactElement {
  return (
    <svg
      className={cn("size-4 shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }): ReactElement {
  return (
    <svg
      className={cn("size-4 shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function HelpCircleIcon({ className }: { className?: string }): ReactElement {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

function ChevronUpIcon({ className }: { className?: string }): ReactElement {
  return (
    <Icon className={className}>
      <path d="m18 15-6-6-6 6" />
    </Icon>
  );
}

function ChevronDownIcon({ className }: { className?: string }): ReactElement {
  return (
    <Icon className={className}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

function ArrowRightIcon({ className }: { className?: string }): ReactElement {
  return (
    <Icon className={className}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Icon>
  );
}

function RadioDot({ selected }: { selected: boolean }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors motion-reduce:transition-none",
        selected ? "border-[#1890FF] bg-[#1890FF] text-white" : "border-zinc-300 bg-white",
      )}
    >
      {selected ? <CheckIcon className="size-2.5" /> : null}
    </span>
  );
}

export function InteractiveQuestionCard({
  data,
  onSubmit,
  onSkip,
}: {
  data: InteractiveQuestionData;
  onSubmit: (answer: string) => void;
  onSkip?: () => void;
}): ReactElement {
  const uid = useId();
  const titleId = `${uid}-title`;
  const customInputId = `${uid}-custom`;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

  const allowCustom = data.allowCustom !== false;
  const trimmedCustom = customText.trim();
  const customActive = selectedId === CUSTOM_OPTION_ID;
  const selectedOption = data.options.find((option) => option.id === selectedId) ?? null;
  const canSubmit = customActive ? trimmedCustom.length > 0 : selectedOption !== null;

  const handleSubmit = () => {
    if (answer !== null) return;
    const value = customActive ? trimmedCustom : (selectedOption?.label ?? "");
    if (value.length === 0) return;
    setAnswer(value);
    onSubmit(value);
  };

  // Tras responder la tarjeta queda como registro de la respuesta: nunca vuelve al formulario.
  if (answer !== null) {
    return (
      <div
        data-question-id={data.id}
        className="w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
      >
        <div role="status" className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[#1890FF] text-white"
          >
            <CheckIcon className="size-2.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900">{answer}</p>
            <p className="text-xs text-zinc-500">Respondido</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-question-id={data.id}
      className="w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
    >
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <HelpCircleIcon className="size-4 text-[#1890FF]" />
          <h3 id={titleId} className="text-sm font-semibold leading-snug text-zinc-900">
            {data.question}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expandir" : "Colapsar"}
          aria-expanded={!collapsed}
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
        >
          {collapsed ? <ChevronDownIcon className="size-4" /> : <ChevronUpIcon className="size-4" />}
        </button>
      </div>

      {!collapsed ? (
        <>
          {/* Opciones */}
          <div className="max-h-[280px] overflow-y-auto px-3.5 py-3 [scrollbar-width:thin]">
            <div role="radiogroup" aria-labelledby={titleId} className="space-y-1.5">
              {data.options.map((option) => {
                const selected = selectedId === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedId(option.id)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-zinc-200 px-3 py-2.5 text-left text-[13px] transition-colors motion-reduce:transition-none",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10",
                      selected ? "border-[#1890FF] bg-[#1890FF]/5" : "hover:bg-zinc-50",
                    )}
                  >
                    <RadioDot selected={selected} />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block leading-snug text-zinc-900",
                          selected ? "font-semibold" : "font-medium",
                        )}
                      >
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-zinc-500">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Otra / texto libre */}
            {allowCustom ? (
              <div
                className={cn(
                  "mt-1.5 rounded-xl border transition-colors motion-reduce:transition-none",
                  customActive
                    ? "border-[#1890FF] bg-[#1890FF]/5"
                    : "border-zinc-200 hover:bg-zinc-50",
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(CUSTOM_OPTION_ID)}
                  aria-pressed={customActive}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
                >
                  <RadioDot selected={customActive} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block leading-snug text-zinc-900",
                        customActive ? "font-semibold" : "font-medium",
                      )}
                    >
                      Otra
                    </span>
                    {!customActive ? (
                      <span className="mt-0.5 block text-[11.5px] leading-relaxed text-zinc-500">
                        Escribe tu respuesta
                      </span>
                    ) : null}
                  </span>
                </button>

                {customActive ? (
                  <div className="pb-2.5 pr-3 pl-[38px]">
                    <input
                      id={customInputId}
                      type="text"
                      value={customText}
                      aria-label="Escribe tu respuesta"
                      placeholder="Escribe tu respuesta"
                      autoComplete="off"
                      autoFocus
                      onChange={(event) => {
                        setCustomText(event.target.value);
                        setSelectedId(CUSTOM_OPTION_ID);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleSubmit();
                        }
                      }}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-[#1890FF] focus:ring-1 focus:ring-[#1890FF]/30 motion-reduce:transition-none"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Pie */}
          <div className="flex items-center justify-between gap-2 border-t border-zinc-200/60 bg-zinc-50/80 px-4 py-2.5">
            {onSkip ? (
              <button
                type="button"
                onClick={onSkip}
                className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10 motion-reduce:transition-none"
              >
                Saltar
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none"
            >
              Continuar
              <ArrowRightIcon className="size-3" />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

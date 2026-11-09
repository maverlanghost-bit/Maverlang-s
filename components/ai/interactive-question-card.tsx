"use client";

import { useId, useState } from "react";
import type { ReactElement } from "react";

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

const CARD_SHADOW =
  "shadow-[inset_0_0_1px_0_rgba(0,0,0,0.85),0_1px_2px_0_rgba(0,0,0,0.04),0_2px_12px_0_rgba(0,0,0,0.03)]";

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors motion-reduce:transition-none",
        selected ? "border-brand bg-brand" : "border-border-strong bg-white",
      )}
    >
      {selected ? <span className="size-1.5 rounded-full bg-white" /> : null}
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
  const [answer, setAnswer] = useState<string | null>(null);

  const allowCustom = data.allowCustom !== false;
  const trimmedCustom = customText.trim();
  const customActive = selectedId === null && customText.length > 0;
  const canSubmit = selectedId !== null || trimmedCustom.length > 0;

  const handleSubmit = () => {
    if (answer !== null) return;
    const selected = data.options.find((option) => option.id === selectedId);
    const value = selected ? selected.label : trimmedCustom;
    if (value.length === 0) return;
    setAnswer(value);
    onSubmit(value);
  };

  // Tras responder la tarjeta queda como registro de la respuesta: nunca vuelve al formulario.
  if (answer !== null) {
    return (
      <div
        data-question-id={data.id}
        className={cn("rounded-2xl border border-border bg-white p-4", CARD_SHADOW)}
      >
        <div role="status" className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-brand text-bg"
          >
            <CheckIcon className="size-2.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg">{answer}</p>
            <p className="text-xs text-fg-muted">Respondido</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-question-id={data.id}
      className={cn("rounded-2xl border border-border bg-white p-4", CARD_SHADOW)}
    >
      <div className="space-y-1">
        <h3 id={titleId} className="text-sm font-semibold text-fg">
          {data.question}
        </h3>
        <p className="text-xs text-fg-muted">Elige una opción para continuar.</p>
      </div>

      <div role="radiogroup" aria-labelledby={titleId} className="mt-3 space-y-1.5">
        {data.options.map((option) => {
          const selected = selectedId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setSelectedId(option.id);
                setCustomText("");
              }}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors motion-reduce:transition-none",
                "focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:outline-none",
                selected
                  ? "border-fg/25 bg-surface-1"
                  : "border-border bg-white hover:bg-surface-1",
              )}
            >
              <RadioDot selected={selected} />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[13px] leading-snug text-fg",
                    selected ? "font-semibold" : "font-medium",
                  )}
                >
                  {option.label}
                </span>
                {option.description ? (
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-fg-muted">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {allowCustom ? (
        <div
          className={cn(
            "mt-1.5 flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5",
            customActive ? "border-fg/25 bg-surface-1" : "border-border bg-white",
          )}
        >
          <RadioDot selected={customActive} />
          <div className="min-w-0 flex-1">
            <label
              htmlFor={customInputId}
              className="block cursor-text text-[13px] font-medium leading-snug text-fg"
            >
              Escribe tu respuesta
            </label>
            <input
              id={customInputId}
              type="text"
              value={customText}
              placeholder="Tu respuesta"
              autoComplete="off"
              onChange={(event) => {
                const next = event.target.value;
                setCustomText(next);
                if (next.length > 0) setSelectedId(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              className="mt-1.5 w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-muted focus-visible:border-border-strong focus-visible:ring-4 focus-visible:ring-fg/15 focus-visible:outline-none"
            />
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        {onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full px-2 py-1 text-xs text-fg-muted transition-colors hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:outline-none motion-reduce:transition-none"
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
          className="inline-flex items-center gap-1.5 rounded-full bg-fg px-3.5 py-1.5 text-xs font-semibold text-bg transition-opacity focus-visible:ring-4 focus-visible:ring-fg/25 focus-visible:outline-none disabled:opacity-40 motion-reduce:transition-none"
        >
          Continuar
          <ArrowRightIcon className="size-3" />
        </button>
      </div>
    </div>
  );
}

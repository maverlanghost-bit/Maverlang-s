"use client";

import { useState, type ChangeEvent, type FormEvent, type RefObject } from "react";

import { IconClose } from "@/components/ui/icons";
import type { AsistenteCopy, AsistenteSuggestionId } from "@/content/i18n/extra-asistente";
import { cn } from "@/lib/cn";

export function Composer({
  copy,
  draft,
  pendingImage,
  typing,
  photoError,
  suggestions,
  onDraft,
  onSubmit,
  onSuggest,
  onAttach,
  onFile,
  onRemoveImage,
  fileRef,
}: {
  copy: AsistenteCopy;
  draft: string;
  pendingImage: string | null;
  typing: boolean;
  photoError: string | null;
  suggestions: boolean;
  onDraft: (value: string) => void;
  onSubmit: () => void;
  onSuggest: (id: AsistenteSuggestionId, text: string) => void;
  onAttach: () => void;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
  fileRef: RefObject<HTMLInputElement | null>;
}) {
  const [mode, setMode] = useState<"fast" | "deep">("fast");
  const canSend = !typing && (draft.trim().length > 0 || pendingImage != null);
  const showSuggestions = suggestions;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    onSubmit();
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto w-full max-w-2xl min-w-0 px-3 pt-1.5 pb-2.5 sm:px-6"
      aria-busy={typing || undefined}
    >
      {pendingImage ? (
        <div className="mb-2 flex items-center gap-2 px-1">
          {/* La foto es un data URL del usuario: el optimizador de Next no la acepta. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingImage} alt={copy.photoAlt} className="h-14 w-14 rounded-xl object-cover shadow-sm" />
          <button
            type="button"
            onClick={onRemoveImage}
            className="inline-flex min-h-10 items-center gap-1 rounded-full border border-border/70 bg-bg-elevated/85 px-3 text-sm text-fg-body backdrop-blur-md outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            <IconClose />
            {copy.removePhoto}
          </button>
        </div>
      ) : null}
      {photoError ? (
        <p role="alert" className="mb-2 px-1 text-sm leading-relaxed break-words text-down">
          {photoError}
        </p>
      ) : null}

      <div className="rounded-[26px] border border-border/80 bg-white px-4 pt-3.5 pb-2.5 shadow-[0_12px_40px_-12px_rgba(12,15,20,0.08),0_2px_8px_rgba(12,15,20,0.03)] transition-all duration-200 focus-within:border-fg/25 focus-within:shadow-[0_16px_48px_-12px_rgba(12,15,20,0.12)]">
        <label htmlFor="ai-pregunta" className="sr-only">
          {copy.placeholder}
        </label>
        <textarea
          id="ai-pregunta"
          value={draft}
          rows={1}
          enterKeyHint="send"
          autoComplete="off"
          placeholder={copy.placeholder}
          disabled={typing}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend) onSubmit();
            }
          }}
          className="max-h-36 min-h-[44px] w-full min-w-0 resize-none border-0 bg-transparent px-0.5 py-1 text-[15px] text-fg outline-none placeholder:text-fg-muted focus-visible:ring-0 disabled:opacity-40 sm:text-base"
        />

        <div className="mt-2 flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onAttach}
              disabled={typing}
              aria-label={copy.attach}
              className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-body transition hover:bg-surface-2 hover:text-fg disabled:opacity-40"
            >
              <PlusIcon />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={onFile}
            />
            <button
              type="button"
              onClick={onAttach}
              disabled={typing}
              className="hidden cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-surface-1/70 px-3 py-1 text-xs font-medium text-fg-body transition hover:bg-surface-2 hover:text-fg disabled:opacity-40 sm:inline-flex"
            >
              <CameraIcon />
              <span>Importar captura</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode((prev) => (prev === "fast" ? "deep" : "fast"))}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-fg-body transition hover:bg-surface-2 hover:text-fg"
            >
              <RocketModeIcon />
              <span>{mode === "fast" ? "Fast" : "Análisis"}</span>
              <ChevronSmallIcon />
            </button>

            <button
              type="submit"
              disabled={!canSend}
              aria-label={copy.send}
              className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-all",
                canSend
                  ? "cursor-pointer bg-fg text-bg shadow-sm hover:opacity-90 active:scale-95"
                  : "bg-brand-soft/85 text-brand disabled:opacity-80",
              )}
            >
              {canSend ? <SendIcon /> : <GrokWaveIcon />}
            </button>
          </div>
        </div>
      </div>

      {showSuggestions ? (
        <div className="-mx-1 mt-3 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 no-scrollbar lg:flex-wrap lg:justify-center lg:overflow-visible">
          {copy.suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={typing}
              onClick={() => onSuggest(item.id, item.text)}
              className="shrink-0 cursor-pointer rounded-full border border-border/75 bg-white px-3.5 py-1.5 text-xs font-medium text-fg-body shadow-2xs transition-all hover:border-fg/30 hover:bg-surface-1 hover:text-fg disabled:opacity-40"
            >
              {item.text}
            </button>
          ))}
        </div>
      ) : null}

      <p className="px-1 pt-2 text-center text-[11px] leading-snug text-fg-muted">{copy.disclaimer}</p>
    </form>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M8 3.25v9.5M3.25 8h9.5" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
      <path
        d="M6 3.5h4l.8 1.3H13a1.2 1.2 0 0 1 1.2 1.2v6.3A1.2 1.2 0 0 1 13 13.5H3A1.2 1.2 0 0 1 1.8 12.3V6A1.2 1.2 0 0 1 3 4.8h2.2L6 3.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8.6" r="2.1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function RocketModeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 text-fg-muted" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path
        d="M9.5 2.5c2.2 0 4 1.8 4 4 0 2.5-2.2 4.8-4.8 6.2l-1.7-1.7L5.3 9.3 3.6 7.6C5 5 7.3 2.5 9.5 2.5Z"
        strokeLinejoin="round"
      />
      <path d="M3.5 12.5 5 11" strokeLinecap="round" />
    </svg>
  );
}

function ChevronSmallIcon() {
  return (
    <svg viewBox="0 0 12 12" className="size-3 text-fg-muted" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="m3 4.5 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
      <path
        d="M8 12.5V3.5M4.5 6.5 8 3.2 11.5 6.5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GrokWaveIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
      <path d="M3 7v2M5.5 5v6M8 3.5v9M10.5 5.5v5M13 7v2" strokeLinecap="round" />
    </svg>
  );
}

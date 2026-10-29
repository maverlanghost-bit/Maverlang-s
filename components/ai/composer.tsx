"use client";

import { IconClose } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { AsistenteCopy, AsistenteSuggestionId } from "@/content/i18n/extra-asistente";
import type { ChangeEvent, FormEvent, RefObject } from "react";

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
      className="min-w-0 bg-gradient-to-t from-bg via-bg/95 to-transparent px-3 pt-2 pb-2.5"
      aria-busy={typing || undefined}
    >
      {showSuggestions ? (
        <div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-2.5 no-scrollbar lg:flex-wrap lg:overflow-visible">
          {copy.suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={typing}
              onClick={() => onSuggest(item.id, item.text)}
              className="min-h-9 shrink-0 rounded-full border border-border/80 bg-bg-elevated/85 px-3.5 py-1.5 text-[12px] font-medium text-fg shadow-[0_4px_14px_-4px_rgba(12,15,20,0.07)] backdrop-blur-md outline-none transition-all duration-200 hover:-translate-y-[1px] hover:border-brand/45 hover:bg-brand-soft/60 focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98] disabled:opacity-40"
            >
              {item.text}
            </button>
          ))}
        </div>
      ) : null}
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
      <div className="flex items-end gap-2 rounded-[26px] border border-white/65 bg-white/82 p-1.5 shadow-[0_14px_38px_-10px_rgba(12,15,20,0.14),0_2px_8px_rgba(12,15,20,0.05),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl backdrop-saturate-180 transition-all duration-300 focus-within:border-brand/50 focus-within:shadow-[0_16px_42px_-10px_rgba(5,150,105,0.22),inset_0_1px_0_rgba(255,255,255,0.95)]">
        <button
          type="button"
          onClick={onAttach}
          disabled={typing}
          aria-label={copy.attach}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2/80 text-fg-muted outline-none transition-all duration-150 hover:bg-surface-3 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.96] disabled:opacity-40"
        >
          <CameraIcon />
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
          className="max-h-32 min-h-10 w-full min-w-0 resize-none rounded-xl border-0 bg-transparent px-2 py-2 text-base text-fg outline-none placeholder:text-fg-muted focus-visible:ring-0 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={copy.send}
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-brand to-emerald-500 text-white shadow-[0_6px_18px_-3px_rgba(5,150,105,0.55)] outline-none transition-all hover:scale-[1.03] focus-visible:ring-4 focus-visible:ring-brand/30 active:scale-[0.96] disabled:opacity-35 disabled:shadow-none disabled:hover:scale-100",
          )}
        >
          <SendIcon />
        </button>
      </div>
      <p className="px-1 pt-2 text-center text-[11px] leading-snug text-fg-muted">{copy.disclaimer}</p>
    </form>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
      <path
        d="M6 3.5h4l.8 1.3H13a1.2 1.2 0 0 1 1.2 1.2v6.3A1.2 1.2 0 0 1 13 13.5H3A1.2 1.2 0 0 1 1.8 12.3V6A1.2 1.2 0 0 1 3 4.8h2.2L6 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8.6" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
      <path d="M8 12.5V3.5M4.5 6.5 8 3.2 11.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

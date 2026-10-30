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
      className="mx-auto w-full max-w-3xl min-w-0 bg-gradient-to-t from-bg via-bg/95 to-transparent px-3 pt-1.5 pb-2.5 sm:px-6"
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
              className="rounded-full border border-border/75 bg-white/80 px-3 py-1 text-xs font-medium text-fg-body shadow-2xs backdrop-blur-md transition-all hover:border-brand/45 hover:bg-brand-soft/60 hover:text-fg disabled:opacity-40"
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
      <div className="flex items-end gap-2 rounded-[28px] border border-white/80 bg-white/90 p-2 shadow-[0_18px_46px_-12px_rgba(12,15,20,0.15),0_2px_10px_rgba(12,15,20,0.04),inset_0_1.5px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl backdrop-saturate-200 transition-all duration-300 focus-within:border-brand/50 focus-within:ring-4 focus-within:ring-brand/12">
        <button
          type="button"
          onClick={onAttach}
          disabled={typing}
          aria-label={copy.attach}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-bg-subtle/85 text-fg-body transition-all hover:border-brand/40 hover:bg-brand-soft/60 hover:text-brand disabled:opacity-40"
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
            "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-brand via-emerald-500 to-teal-500 text-white shadow-[0_8px_20px_-4px_rgba(5,150,105,0.6)] transition-all hover:scale-[1.04] active:scale-[0.96] disabled:opacity-35 disabled:shadow-none",
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

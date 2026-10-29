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

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    onSubmit();
  }

  return (
    <form onSubmit={submit} className="min-w-0 border-t border-border/70 bg-bg/95 px-3 pt-2 pb-2 backdrop-blur-xl" aria-busy={typing || undefined}>
      {suggestions ? (
        <div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-2 no-scrollbar lg:flex-wrap lg:overflow-visible">
          {copy.suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={typing}
              onClick={() => onSuggest(item.id, item.text)}
              className="min-h-11 shrink-0 rounded-full border border-border/70 bg-bg px-4 text-sm text-fg outline-none transition duration-[140ms] ease-spring hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98] disabled:opacity-40"
            >
              {item.text}
            </button>
          ))}
        </div>
      ) : null}
      {pendingImage ? (
        <div className="mb-2 flex items-center gap-2">
          {/* La foto es un data URL del usuario: el optimizador de Next no la acepta. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingImage} alt={copy.photoAlt} className="h-14 w-14 rounded-xl object-cover" />
          <button
            type="button"
            onClick={onRemoveImage}
            className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm text-fg-body outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            <IconClose />
            {copy.removePhoto}
          </button>
        </div>
      ) : null}
      {photoError ? (
        <p role="alert" className="mb-2 text-sm leading-relaxed break-words text-down">
          {photoError}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={onAttach}
          disabled={typing}
          aria-label={copy.attach}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg outline-none transition duration-[140ms] ease-spring hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98] disabled:opacity-40"
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
          className="max-h-32 min-h-11 w-full min-w-0 resize-none rounded-md border border-border bg-surface-2 px-3 py-2.5 text-base text-fg outline-none transition duration-[140ms] ease-spring placeholder:text-fg-subtle focus:border-border-strong focus-visible:ring-4 focus-visible:ring-fg/20 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={copy.send}
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-fg text-white outline-none transition duration-[140ms] ease-spring hover:bg-[#1f2329] focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98] disabled:opacity-40",
          )}
        >
          <SendIcon />
        </button>
      </div>
      <p className="px-1 pt-2 text-center text-xs leading-snug text-fg-muted">{copy.disclaimer}</p>
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

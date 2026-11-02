"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent, type RefObject } from "react";
import { createPortal } from "react-dom";

import { IconClose } from "@/components/ui/icons";
import type { AsistenteCopy, AsistenteSuggestionId } from "@/content/i18n/extra-asistente";
import { cn } from "@/lib/cn";

// Mismo valor que AI_DOCK_SLOT_ID de components/app-shell/nav.ts.
const DOCK_SLOT_ID = "mv-ai-dock-slot";
const MOBILE_QUERY = "(max-width: 1023px)";

/** Anillo de foco compartido por todos los controles del compositor. */
const FOCUS_RING = "outline-none focus-visible:ring-4 focus-visible:ring-fg/20";

/** Devuelve el contenedor del dock móvil (dentro de la barra inferior) o null. */
function useDockSlot(): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const find = () => {
      const el = query.matches ? document.getElementById(DOCK_SLOT_ID) : null;
      setSlot((prev) => (prev === el ? prev : el));
      return el;
    };
    find();
    query.addEventListener("change", find);
    const observer = new MutationObserver(() => {
      if (find()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      query.removeEventListener("change", find);
      observer.disconnect();
    };
  }, []);
  return slot;
}

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

  const dockSlot = useDockSlot();

  const pendingBlock = pendingImage ? (
    <div className="mb-2 flex items-center gap-2.5 px-1">
      {/* La foto es un data URL del usuario: el optimizador de Next no la acepta. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pendingImage}
        alt={copy.photoAlt}
        className="h-14 w-14 shrink-0 rounded-2xl border border-border/70 object-cover shadow-2xs"
      />
      <button
        type="button"
        onClick={onRemoveImage}
        className={cn(
          "inline-flex min-h-10 touch-manipulation items-center gap-1.5 rounded-full border border-border/70 bg-white/90 px-3 text-xs font-medium text-fg-body shadow-2xs backdrop-blur-md transition hover:border-border-strong hover:bg-surface-1 hover:text-fg active:scale-[0.98] motion-reduce:transition-none",
          FOCUS_RING,
        )}
      >
        <IconClose />
        {copy.removePhoto}
      </button>
    </div>
  ) : null;

  const errorBlock = photoError ? (
    <p
      id="ai-composer-error"
      role="alert"
      className="mb-2 rounded-xl border border-down/20 bg-down-bg/80 px-3 py-2 text-xs leading-relaxed break-words text-down"
    >
      {photoError}
    </p>
  ) : null;

  const fileInput = (
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
  );

  const textarea = (
    <>
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
        aria-describedby={photoError ? "ai-composer-error ai-composer-note" : "ai-composer-note"}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (canSend) onSubmit();
          }
        }}
        className={
          dockSlot
            ? "max-h-11 min-h-11 min-w-0 flex-1 resize-none border-0 bg-transparent px-1.5 py-2.5 text-[16px] leading-5 text-fg outline-none placeholder:text-fg-muted focus-visible:ring-0 disabled:opacity-50"
            : "max-h-36 min-h-[52px] w-full min-w-0 resize-none border-0 bg-transparent px-0.5 py-1 text-[15.5px] leading-6 text-fg outline-none placeholder:text-fg-muted focus-visible:ring-0 disabled:opacity-50 sm:text-base"
        }
      />
    </>
  );

  const sendButton = (
    <button
      type="submit"
      disabled={!canSend}
      aria-label={copy.send}
      className={cn(
        "inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full transition-all duration-150 active:scale-95 motion-reduce:transition-none",
        dockSlot ? "size-11" : "size-10",
        canSend
          ? "cursor-pointer bg-fg text-bg shadow-[0_2px_10px_rgba(10,10,10,0.24)] hover:opacity-90"
          : "cursor-not-allowed bg-surface-2 text-fg-subtle",
        FOCUS_RING,
      )}
    >
      {canSend ? <SendIcon /> : <GrokWaveIcon />}
    </button>
  );

  const chips = showSuggestions ? (
    <div
      className={cn(
        "no-scrollbar -mx-1 flex min-w-0 snap-x snap-mandatory gap-1.5 overflow-x-auto scroll-px-2 px-1 pb-1 lg:mx-0 lg:flex-wrap lg:justify-center lg:overflow-visible lg:pb-0",
        dockSlot ? "mt-1.5" : "mt-3",
      )}
    >
      {copy.suggestions.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={typing}
          onClick={() => onSuggest(item.id, item.text)}
          className={cn(
            "min-h-9 shrink-0 snap-start touch-manipulation cursor-pointer rounded-full border border-border/75 bg-white px-3.5 text-xs font-medium text-fg-body shadow-2xs transition hover:border-border-strong hover:bg-surface-1 hover:text-fg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none lg:min-h-8",
            FOCUS_RING,
          )}
        >
          {item.text}
        </button>
      ))}
    </div>
  ) : null;

  const disclaimer = (
    <p id="ai-composer-note" className="px-1 pt-2 text-center text-[11px] leading-relaxed text-balance text-fg-muted">
      {copy.disclaimer}
    </p>
  );

  if (dockSlot) {
    // Móvil: el formulario vive dentro de la barra inferior (dock); chips y aviso quedan sobre ella.
    return (
      <>
        <div className="mx-auto w-full max-w-2xl min-w-0 px-3 pt-1.5 pb-1">
          {pendingBlock}
          {errorBlock}
          {chips}
          {disclaimer}
        </div>
        {createPortal(
          <form
            onSubmit={submit}
            aria-busy={typing || undefined}
            className="flex min-h-12 w-full min-w-0 items-center gap-1.5 px-1"
          >
            <button
              type="button"
              onClick={onAttach}
              disabled={typing}
              aria-label={copy.attach}
              className={cn(
                "inline-flex size-11 shrink-0 touch-manipulation cursor-pointer items-center justify-center rounded-full text-fg-body transition hover:bg-surface-2 hover:text-fg active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
                FOCUS_RING,
              )}
            >
              <PlusIcon />
            </button>
            {fileInput}
            {textarea}
            {sendButton}
          </form>,
          dockSlot,
        )}
      </>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto w-full max-w-2xl min-w-0 px-3 pt-1.5 pb-2.5 sm:px-6 sm:pb-3"
      aria-busy={typing || undefined}
    >
      {pendingBlock}
      {errorBlock}

      <div className="relative rounded-[26px] border border-border/80 bg-white shadow-[0_1px_2px_rgba(12,15,20,0.04),0_12px_36px_-18px_rgba(12,15,20,0.18)] transition-[border-color,box-shadow] duration-200 focus-within:border-fg/20 focus-within:ring-4 focus-within:ring-fg/5 focus-within:shadow-[0_1px_2px_rgba(12,15,20,0.04),0_18px_46px_-18px_rgba(12,15,20,0.24)] motion-reduce:transition-none">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-fg/10 to-transparent"
        />

        <div className="px-3.5 pt-3 sm:px-4 sm:pt-3.5">{textarea}</div>

        <div className="mt-1 flex items-end justify-between gap-2 border-t border-border/60 px-2 py-2 sm:px-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onAttach}
              disabled={typing}
              aria-label={copy.attach}
              className={cn(
                "inline-flex size-10 shrink-0 touch-manipulation cursor-pointer items-center justify-center rounded-full border border-border/70 bg-white text-fg-body shadow-2xs transition hover:border-border-strong hover:bg-surface-1 hover:text-fg active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
                FOCUS_RING,
              )}
            >
              <PlusIcon />
            </button>
            {fileInput}
            <button
              type="button"
              onClick={onAttach}
              disabled={typing}
              className={cn(
                "hidden min-h-10 touch-manipulation cursor-pointer items-center gap-1.5 rounded-full bg-surface-1 px-3 text-xs font-medium text-fg-body transition hover:bg-surface-2 hover:text-fg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none sm:inline-flex",
                FOCUS_RING,
              )}
            >
              <CameraIcon />
              <span>Importar captura</span>
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMode((prev) => (prev === "fast" ? "deep" : "fast"))}
              className={cn(
                "inline-flex min-h-10 touch-manipulation cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-surface-1/60 px-3 text-xs font-semibold text-fg-body transition hover:border-border-strong hover:bg-surface-2 hover:text-fg active:scale-[0.98] motion-reduce:transition-none",
                FOCUS_RING,
              )}
            >
              <RocketModeIcon />
              <span>{mode === "fast" ? "Fast" : "Análisis"}</span>
              <ChevronSmallIcon
                className={cn("transition-transform duration-200 motion-reduce:transition-none", mode === "deep" && "rotate-180")}
              />
            </button>
            {sendButton}
          </div>
        </div>
      </div>

      {chips}
      {disclaimer}
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

function ChevronSmallIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={cn("size-3 text-fg-muted", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
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

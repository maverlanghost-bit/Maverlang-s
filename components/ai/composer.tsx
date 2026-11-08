"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent, type RefObject } from "react";
import { createPortal } from "react-dom";

import {
  applyReasoningPrefix,
  ReasoningModeBar,
  type AiReasoningMode,
} from "@/components/ai/reasoning-mode-bar";
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
  const canSend = !typing && (draft.trim().length > 0 || pendingImage != null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    onSubmit();
  }

  const dockSlot = useDockSlot();

  // Modo de razonamiento del compositor de escritorio (flash por defecto).
  const [mode, setMode] = useState<AiReasoningMode>("flash");
  const showCount = draft.length > 1200;

  function handleModeChange(nextMode: AiReasoningMode) {
    setMode(nextMode);
    if (nextMode === "deep" && draft.trim().length > 0) {
      onDraft(applyReasoningPrefix(draft, "deep"));
    } else if (nextMode === "portfolio" && draft.trim().length === 0) {
      onDraft("Analiza mi cartera: concentración, riesgos y balance");
    }
  }

  const pendingBlock = pendingImage ? (
    <div className="mb-2.5 flex items-center gap-2.5 rounded-2xl border border-border/70 bg-white/85 p-2 pr-2.5">
      {/* La foto es un data URL del usuario: el optimizador de Next no la acepta. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pendingImage}
        alt=""
        className="size-12 shrink-0 rounded-xl border border-border/60 object-cover"
      />
      <p className="min-w-0 flex-1 truncate text-xs font-medium text-fg-body">{copy.photoAlt}</p>
      <button
        type="button"
        onClick={onRemoveImage}
        className={cn(
          "inline-flex min-h-9 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border border-border/70 bg-white px-3 text-xs font-medium text-fg-body transition hover:border-border-strong hover:bg-surface-1 hover:text-fg active:scale-[0.98] motion-reduce:transition-none",
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
            : "max-h-40 min-h-11 min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-2.5 text-[15.5px] leading-6 text-fg outline-none placeholder:text-fg-muted focus-visible:ring-0 disabled:opacity-50"
        }
      />
    </>
  );

  const sendButton = (
    <button
      type="submit"
      disabled={!canSend}
      aria-label={copy.send}
      title={copy.send}
      className={cn(
        "inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full transition-all duration-150 active:scale-95 motion-reduce:transition-none",
        dockSlot ? "size-11" : "size-10",
        canSend
          ? "cursor-pointer bg-fg text-bg hover:opacity-90"
          : "cursor-not-allowed bg-surface-2 text-fg-subtle",
        FOCUS_RING,
      )}
    >
      <SendIcon />
    </button>
  );

  const attachButton = (
    <button
      type="button"
      onClick={onAttach}
      disabled={typing}
      aria-label={copy.attach}
      title={copy.attach}
      className={cn(
        "inline-flex shrink-0 touch-manipulation cursor-pointer items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-1 hover:text-fg active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
        dockSlot ? "size-11" : "size-10",
        FOCUS_RING,
      )}
    >
      <CameraIcon />
    </button>
  );

  // En escritorio las sugerencias viven bajo el compositor; en móvil, la grilla
  // del estado vacío ya las ofrece más grande, así que aquí no se repiten.
  const chips = suggestions ? (
    <div className="mt-3 hidden min-w-0 flex-wrap items-center justify-center gap-2 lg:flex">
      {copy.suggestions.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={typing}
          onClick={() => onSuggest(item.id, item.text)}
          className={cn(
            "min-h-9 shrink-0 touch-manipulation cursor-pointer rounded-full border border-border/75 bg-white px-3.5 text-[12.5px] font-medium text-fg-body transition hover:border-border-strong hover:bg-surface-1 hover:text-fg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
            FOCUS_RING,
          )}
        >
          {item.text}
        </button>
      ))}
    </div>
  ) : null;

  // Aviso permanente y único: se renderiza una sola vez en cada variante
  // (dock móvil o compositor de escritorio), nunca junto a otro igual.
  const adviceNotice = (
    <p
      id="ai-composer-note"
      role="note"
      data-ai-advice-notice
      className="mx-auto max-w-[46ch] px-1 pt-2.5 text-center text-[11.5px] leading-relaxed text-balance text-fg-muted sm:text-xs"
    >
      {copy.adviceNotice}
    </p>
  );

  if (dockSlot) {
    // Móvil: el formulario vive dentro de la barra inferior (dock); foto, error y aviso quedan sobre ella.
    return (
      <>
        <div className="mx-auto w-full max-w-2xl min-w-0 px-4 pt-1.5 pb-1 sm:px-6">
          {/* Selector de modo también en móvil, encima de la barra del dock. */}
          <div
            aria-disabled={typing || undefined}
            className={cn(
              "mb-1.5 flex items-center justify-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              typing && "pointer-events-none opacity-60",
            )}
          >
            <ReasoningModeBar mode={mode} onChange={handleModeChange} />
          </div>
          {pendingBlock}
          {errorBlock}
          {adviceNotice}
        </div>
        {createPortal(
          <form
            onSubmit={submit}
            aria-busy={typing || undefined}
            className="flex min-h-12 w-full min-w-0 items-center gap-1.5 px-1"
          >
            {attachButton}
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
      aria-busy={typing || undefined}
      className="mx-auto w-full max-w-2xl min-w-0 px-4 pt-2 pb-3 sm:px-6 sm:pb-4 lg:px-0 lg:pb-6"
    >
      {pendingBlock}
      {errorBlock}

      <div className="relative rounded-3xl border border-border/80 bg-white shadow-[0_1px_2px_rgba(12,15,20,0.04),0_18px_40px_-28px_rgba(12,15,20,0.25)] transition-[border-color,box-shadow] duration-200 focus-within:border-fg/20 focus-within:ring-4 focus-within:ring-fg/[0.06] motion-reduce:transition-none">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-fg/10 to-transparent"
        />
        <div className="overflow-hidden rounded-t-3xl border-b border-border/60 px-2.5 py-1.5">
          <ReasoningModeBar mode={mode} onChange={handleModeChange} />
        </div>
        <div className={cn("flex min-w-0 items-end gap-1.5 px-2 py-2 sm:px-3", showCount && "pb-7")}>
          {attachButton}
          {fileInput}
          {textarea}
          {sendButton}
        </div>
        {showCount ? (
          <p
            aria-live="polite"
            className="pointer-events-none absolute right-2.5 bottom-1.5 text-[11px] leading-none tabular-nums text-fg-muted sm:right-3"
          >
            {draft.length}
          </p>
        ) : null}
      </div>

      {chips}
      {adviceNotice}
    </form>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4.5" fill="none" aria-hidden>
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

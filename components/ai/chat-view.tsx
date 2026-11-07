"use client";

import Link from "next/link";
import { useRef, type ChangeEvent, type RefObject } from "react";

import { Composer } from "@/components/ai/composer";
import type { ChatMessage } from "@/components/ai/model";
import { Transcript } from "@/components/ai/transcript";
import { useChatViewport } from "@/components/ai/use-chat-viewport";
import { AiWidgetStack } from "@/components/ai/widget-stack";
import type { AsistenteCopy, AsistenteSuggestionId } from "@/content/i18n/extra-asistente";
import { cn } from "@/lib/cn";

export function ChatView({
  copy,
  messages,
  draft,
  pendingImage,
  typing,
  photoError,
  announcement,
  onDraft,
  onSubmit,
  onSuggest,
  onAttach,
  onFile,
  onRemoveImage,
  onRetry,
  onClear,
  fileRef,
  backLabel,
}: {
  copy: AsistenteCopy;
  backLabel: string;
  messages: readonly ChatMessage[];
  draft: string;
  pendingImage: string | null;
  typing: boolean;
  photoError: string | null;
  announcement: string;
  onDraft: (value: string) => void;
  onSubmit: () => void;
  onSuggest: (id: AsistenteSuggestionId, text: string) => void;
  onAttach: () => void;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
  onRetry: () => void;
  onClear: () => void;
  fileRef: RefObject<HTMLInputElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useChatViewport(panelRef);
  const isEmpty = messages.length === 0 && !typing;

  // Móvil: el compositor vive en el dock de la barra inferior (padding inferior = --app-tabs-height).
  // El header es minimalista: en escritorio no repite subtítulos ni cápsulas redundantes.
  return (
    <div
      ref={panelRef}
      data-ai-chat
      className="fixed z-20 flex min-h-0 flex-col overflow-hidden bg-bg lg:left-[var(--app-sidebar-width,0px)]! lg:transition-[left] lg:duration-200 lg:ease-spring lg:motion-reduce:transition-none"
      style={{ top: 0, right: 0, left: 0, height: "100dvh" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(110% 45% at 50% -10%, var(--color-surface-1) 0%, rgba(255,255,255,0) 58%)",
        }}
      />

      <div className="relative mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col">
        {/* Cabecera minimalista: sin píldoras apiladas ni subtítulos repetidos */}
        <header className="relative z-10 shrink-0">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-2 sm:px-6 lg:px-0 lg:pt-5 lg:pb-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Link
                href="/app"
                aria-label={backLabel}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border/75 bg-white/85 text-fg-body transition hover:border-fg/25 hover:bg-white hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg active:scale-95 motion-reduce:transition-none lg:hidden"
              >
                <ArrowLeftIcon />
              </Link>
              <h1 className="truncate text-sm font-medium tracking-tight text-fg-muted lg:text-[13px]">
                {copy.pageTitle}
              </h1>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {messages.length > 0 ? (
                <button
                  type="button"
                  aria-label={copy.clear}
                  title={copy.clear}
                  onClick={onClear}
                  className="inline-flex h-8 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border border-border/70 bg-white/85 px-3 text-xs font-medium text-fg-body transition hover:border-fg/25 hover:bg-white hover:text-fg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-95 motion-reduce:transition-none"
                >
                  <ResetSparkleIcon />
                  <span className="hidden sm:inline">{copy.clear}</span>
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <div
          className={cn(
            "relative flex min-h-0 flex-1 flex-col",
            isEmpty && "lg:justify-center lg:pb-12",
          )}
        >
          <Transcript
            copy={copy}
            messages={messages}
            typing={typing}
            announcement={announcement}
            onRetry={onRetry}
            onSuggest={onSuggest}
            renderWidgets={(widgets) => <AiWidgetStack widgets={widgets} copy={copy} />}
          />
          <Composer
            copy={copy}
            draft={draft}
            pendingImage={pendingImage}
            typing={typing}
            photoError={photoError}
            suggestions={isEmpty}
            onDraft={onDraft}
            onSubmit={onSubmit}
            onSuggest={onSuggest}
            onAttach={onAttach}
            onFile={onFile}
            onRemoveImage={onRemoveImage}
            fileRef={fileRef}
          />
        </div>
      </div>
    </div>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M13 8H3m0 0 4-4M3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ResetSparkleIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
      <path
        d="M13.25 8a5.25 5.25 0 1 1-1.45-3.63M13.25 2.75v2.1h-2.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

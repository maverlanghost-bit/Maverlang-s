"use client";

import { useRef, type ChangeEvent, type RefObject } from "react";

import { Composer } from "@/components/ai/composer";
import type { ChatMessage } from "@/components/ai/model";
import { Transcript } from "@/components/ai/transcript";
import { useChatViewport } from "@/components/ai/use-chat-viewport";
import { AiWidgetStack } from "@/components/ai/widget-stack";
import { Button } from "@/components/ui/button";
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
}: {
  copy: AsistenteCopy;
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

  // Móvil: sin barra superior; el compositor vive en el dock de la barra inferior (padding inferior = --app-tabs-height).
  return (
    <div
      ref={panelRef}
      data-ai-chat
      className="fixed z-20 flex min-h-0 flex-col overflow-hidden bg-bg"
      style={{ top: 0, right: 0, left: 0, height: "100dvh" }}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col">
        <div className="flex min-h-10 items-center justify-between gap-3 pt-[calc(env(safe-area-inset-top,0px)+0.625rem)] pr-4 pb-1.5 pl-[108px] sm:pr-6 lg:pt-3 lg:pl-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-xs font-medium text-fg-muted sm:text-[13px]">{copy.pageTitle}</h1>
              <span className="hidden rounded-full border border-border/70 bg-surface-1/80 px-2 py-0.5 text-[10px] font-medium text-fg-muted sm:inline-flex">
                xStocks 24/7
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {messages.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-border/75 bg-white/85 px-3 py-1 text-xs font-medium text-fg-body shadow-2xs transition hover:border-fg/30 hover:bg-white hover:text-fg"
                onClick={onClear}
              >
                <ResetSparkleIcon />
                <span>{copy.clear}</span>
              </Button>
            ) : null}
            <span
              title="SesiÃ³n privada guardada sÃ³lo en tu navegador"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border/70 bg-white/75 px-3 py-1 text-xs font-medium text-fg-body shadow-2xs"
            >
              <PrivateShieldIcon />
              <span>Privado</span>
            </span>
          </div>
        </div>

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            isEmpty && "lg:justify-center lg:pb-14",
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

function PrivateShieldIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 text-fg-muted" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path
        d="M8 2.25 3.25 4.2v3.55c0 3.05 2.02 5.45 4.75 6.25 2.73-.8 4.75-3.2 4.75-6.25V4.2L8 2.25Z"
        strokeLinejoin="round"
      />
      <path d="m6.2 8.1 1.25 1.25 2.45-2.45" strokeLinecap="round" strokeLinejoin="round" />
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

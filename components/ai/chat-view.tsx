"use client";

import { useRef, type ChangeEvent, type RefObject } from "react";

import { Composer } from "@/components/ai/composer";
import type { ChatMessage } from "@/components/ai/model";
import { Transcript } from "@/components/ai/transcript";
import { useChatViewport } from "@/components/ai/use-chat-viewport";
import { AiWidgetStack } from "@/components/ai/widget-stack";
import { Button } from "@/components/ui/button";
import type { AsistenteCopy, AsistenteSuggestionId } from "@/content/i18n/extra-asistente";

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

  // Mobile viewport baseline above docked nav (data-mode="composer"): calc(100dvh - 3.5rem - 5.25rem - env(safe-area-inset-bottom, 0px))
  return (
    <div
      ref={panelRef}
      data-ai-chat
      className="fixed z-20 flex min-h-0 flex-col overflow-hidden bg-bg bg-[radial-gradient(100%_55%_at_50%_0%,rgba(5,150,105,0.09),rgba(14,165,233,0.04)_45%,transparent_75%)]"
      style={{ top: 0, right: 0, left: 0, height: "100dvh" }}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-white/70 px-4 py-2.5 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div
              aria-hidden="true"
              className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-brand to-teal-600 text-white shadow-[0_6px_18px_-4px_rgba(5,150,105,0.55)] ring-1 ring-white/50"
            >
              <HeaderSparkleIcon />
              <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-white bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.85)]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-semibold tracking-tight text-fg">{copy.pageTitle}</h1>
                <span className="rounded-full border border-brand/25 bg-brand-soft/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-brand uppercase">
                  Copiloto 24/7
                </span>
              </div>
              <p className="truncate text-xs text-fg-muted">{copy.lead}</p>
            </div>
          </div>
          {messages.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-semibold text-fg-body shadow-2xs backdrop-blur-md transition-all hover:border-brand/40 hover:bg-brand-soft/50 hover:text-brand"
              onClick={onClear}
            >
              <ResetSparkleIcon />
              <span>{copy.clear}</span>
            </Button>
          ) : null}
        </div>
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
          suggestions={messages.length === 0 && !typing}
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
  );
}

function HeaderSparkleIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
      <path
        d="M10 2.5c.35 2.9 1.6 4.15 4.5 4.5-2.9.35-4.15 1.6-4.5 4.5-.35-2.9-1.6-4.15-4.5-4.5 2.9-.35 4.15-1.6 4.5-4.5Z"
        fill="currentColor"
        fillOpacity="0.3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14.75 11.75c.18 1.35.75 1.92 2.1 2.1-1.35.18-1.92.75-2.1 2.1-.18-1.35-.75-1.92-2.1-2.1 1.35-.18 1.92-.75 2.1-2.1Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
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

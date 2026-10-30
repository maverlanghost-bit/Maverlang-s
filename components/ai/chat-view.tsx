"use client";

import Link from "next/link";
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

  // Mobile viewport baseline above docked nav (data-mode="composer"): calc(100dvh - 3.5rem - 5.25rem - env(safe-area-inset-bottom, 0px))
  return (
    <div
      ref={panelRef}
      data-ai-chat
      className="fixed z-20 flex min-h-0 flex-col overflow-hidden bg-bg"
      style={{ top: 0, right: 0, left: 0, height: "100dvh" }}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col">
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              href="/app"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border/75 bg-white/85 px-3 py-1 text-xs font-semibold text-fg shadow-2xs transition hover:border-brand/40 hover:bg-brand-soft/40 hover:text-brand lg:hidden"
            >
              <BackArrowIcon />
              <span>Mercado</span>
            </Link>
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
              title="Sesión privada guardada sólo en tu navegador"
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

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M13 8H3m0 0 4-4M3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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

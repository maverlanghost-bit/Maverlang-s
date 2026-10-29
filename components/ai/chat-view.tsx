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
      className="fixed z-20 flex min-h-0 flex-col overflow-hidden bg-bg bg-[radial-gradient(90%_55%_at_50%_0%,rgba(5,150,105,0.06),transparent_70%)]"
      style={{ top: 0, right: 0, left: 0, height: "100dvh" }}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col lg:border-x lg:border-border/70">
        <div className="flex items-start justify-between gap-3 border-b border-border/70 bg-bg-elevated/60 px-4 py-3 backdrop-blur-md">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-flex h-2 w-2 shrink-0 rounded-full bg-brand shadow-[0_0_8px_rgba(5,150,105,0.75)] motion-safe:animate-pulse"
              />
              <h1 className="text-base font-semibold tracking-tight text-fg">{copy.pageTitle}</h1>
            </div>
            <p className="mt-0.5 text-sm leading-snug text-pretty text-fg-muted">{copy.lead}</p>
          </div>
          {messages.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-9 shrink-0 rounded-full border border-border/80 bg-bg-elevated/80 px-3 py-1.5 text-[12px] font-medium text-fg-muted backdrop-blur-md transition-all hover:border-brand/40 hover:text-fg"
              onClick={onClear}
            >
              {copy.clear}
            </Button>
          ) : null}
        </div>
        <Transcript
          copy={copy}
          messages={messages}
          typing={typing}
          announcement={announcement}
          onRetry={onRetry}
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

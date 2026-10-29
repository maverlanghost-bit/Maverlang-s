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

  return (
    <div
      ref={panelRef}
      data-ai-chat
      className="fixed z-20 flex min-h-0 flex-col overflow-hidden bg-bg"
      style={{ top: 0, right: 0, left: 0, height: "100dvh" }}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col lg:border-x lg:border-border/70">
        <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-fg">{copy.pageTitle}</h1>
            <p className="text-sm leading-snug text-pretty text-fg-muted">{copy.lead}</p>
          </div>
          {messages.length > 0 ? (
            <Button variant="ghost" size="sm" className="min-h-11 shrink-0 px-3" onClick={onClear}>
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

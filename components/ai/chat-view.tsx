"use client";

import Link from "next/link";
import { useRef, type ChangeEvent, type RefObject } from "react";

import { AssistantNavbar } from "@/components/ai/assistant-navbar";
import { Composer } from "@/components/ai/composer";
import type { ChatMessage } from "@/components/ai/model";
import { Transcript } from "@/components/ai/transcript";
import { useChatViewport } from "@/components/ai/use-chat-viewport";
import { AiWidgetStack } from "@/components/ai/widget-stack";
import type { AsistenteCopy, AsistenteSuggestionId } from "@/content/i18n/extra-asistente";
import { cn } from "@/lib/cn";

type ChatFeedback = Readonly<Record<string, "like" | "dislike">>;

type ChatViewProps = {
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
  chatTitle?: string;
  isPinned?: boolean;
  selectedModel?: "fast" | "pro";
  onSelectModel?: (model: "fast" | "pro") => void;
  onRenameChat?: (title: string) => void;
  onTogglePin?: () => void;
  onNewChat?: () => void;
  onShareChat?: () => void;
  onCopyAllText?: () => void;
  onExportMarkdown?: () => void;
  onDeleteChat?: () => void;
  onOpenSearch?: () => void;
  webSearchEnabled?: boolean;
  onToggleWebSearch?: () => void;
  activeTools?: readonly string[];
  onToggleTool?: (id: string) => void;
  onStop?: () => void;
  onEditMessage?: (id: string, text: string) => void;
  feedback?: ChatFeedback;
  onFeedback?: (id: string, type: "like" | "dislike") => void;
  onShareAnswer?: (id: string) => void;
  onRetryAnswer?: () => void;
};

export function ChatView({
  copy,
  backLabel,
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
  chatTitle,
  isPinned,
  selectedModel,
  onSelectModel,
  onRenameChat,
  onTogglePin,
  onNewChat,
  onShareChat,
  onCopyAllText,
  onExportMarkdown,
  onDeleteChat,
  onOpenSearch,
  webSearchEnabled,
  onToggleWebSearch,
  activeTools,
  onToggleTool,
  onStop,
  onEditMessage,
  feedback,
  onFeedback,
  onShareAnswer,
  onRetryAnswer,
}: ChatViewProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useChatViewport(panelRef);
  const isEmpty = messages.length === 0 && !typing;

  // Los atajos del estado vacío envían de inmediato: `onSuggest` ya resuelve
  // el endpoint y la foto; el compositor sólo aporta el borrador manual.
  function sendPrompt(text: string) {
    const prompt = text.trim();
    if (!prompt) return;
    onSuggest("tesla", prompt);
  }

  function renderComposer(variant: "landing" | "bottom") {
    return (
      <Composer
        copy={copy}
        draft={draft}
        pendingImage={pendingImage}
        typing={typing}
        photoError={photoError}
        suggestions={false}
        onDraft={onDraft}
        onSubmit={onSubmit}
        onSuggest={onSuggest}
        onAttach={onAttach}
        onFile={onFile}
        onRemoveImage={onRemoveImage}
        fileRef={fileRef}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
        webSearchEnabled={webSearchEnabled}
        onToggleWebSearch={onToggleWebSearch}
        activeTools={activeTools}
        onToggleTool={onToggleTool}
        onStop={onStop}
        variant={variant}
      />
    );
  }

  // Móvil: el compositor vive en el dock de la barra inferior (padding inferior = --app-tabs-height).
  return (
    <div
      ref={panelRef}
      data-ai-chat
      className={cn(
        "fixed z-20 flex min-h-0 flex-col overflow-hidden bg-white lg:left-[var(--app-sidebar-width,0px)]!",
      )}
      style={{ top: 0, right: 0, left: 0, height: "100dvh" }}
    >
      <AssistantNavbar
        chatTitle={chatTitle ?? copy.pageTitle}
        hasMessages={messages.length > 0}
        isPinned={isPinned}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
        onRenameChat={onRenameChat}
        onTogglePin={onTogglePin}
        onNewChat={onNewChat ?? onClear}
        onShareChat={onShareChat}
        onCopyAllText={onCopyAllText}
        onExportMarkdown={onExportMarkdown}
        onDeleteChat={onDeleteChat}
        onOpenSearch={onOpenSearch}
        leading={
          <Link
            href="/app"
            aria-label={backLabel}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-muted transition hover:bg-surface-1 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:outline-none motion-reduce:transition-none lg:hidden"
          >
            <ArrowLeftIcon />
          </Link>
        }
        className="relative z-10 shrink-0"
      />

      <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <Transcript
          copy={copy}
          messages={messages}
          typing={typing}
          announcement={announcement}
          onRetry={onRetry}
          onSuggest={onSuggest}
          renderWidgets={(widgets) => <AiWidgetStack widgets={widgets} copy={copy} />}
          landingComposer={isEmpty ? renderComposer("landing") : undefined}
          onSendPrompt={sendPrompt}
          onEditMessage={onEditMessage}
          feedback={feedback}
          onFeedback={onFeedback}
          onShareAnswer={onShareAnswer}
          onRetryAnswer={onRetryAnswer}
        />

        {!isEmpty ? (
          <div className="bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-4 pt-2 shrink-0">
            <div className="max-w-3xl mx-auto w-full">{renderComposer("bottom")}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M13 8H3m0 0 4-4M3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

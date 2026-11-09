"use client";

import { useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";

import { BrandFavicon } from "@/components/app-shell/brand-image";
import { CodeBlock, detectCodeLanguage } from "@/components/ai/code-block";
import type { AiWidget } from "@/components/ai/contract";
import { GrokThinkingCard } from "@/components/ai/grok-thinking-card";
import { MarketPulseBar } from "@/components/ai/market-pulse-bar";
import { AssistantMessageActions } from "@/components/ai/message-actions";
import type { ChatMessage } from "@/components/ai/model";
import { NoticeCard } from "@/components/ai/notices";
import { ReasoningAccordion } from "@/components/ai/reasoning-accordion";
import { RichAssistantMessage } from "@/components/ai/rich-message";
import { SourcesList } from "@/components/ai/tool-accordion";
import { PromptSuggestions, WelcomeChips } from "@/components/ai/welcome-chips";
import type { AsistenteCopy, AsistenteSuggestionId } from "@/content/i18n/extra-asistente";
import { cn } from "@/lib/cn";

/** Campos opcionales que el coordinador puede adjuntar al mensaje guardado. */
type MessageExtras = {
  reasoning?: string | null;
  reasoningText?: string | null;
  sources?: readonly string[];
};

type TranscriptProps = {
  copy: AsistenteCopy;
  messages: readonly ChatMessage[];
  typing: boolean;
  announcement: string;
  onRetry: () => void;
  onSuggest?: (id: AsistenteSuggestionId, text: string) => void;
  renderWidgets: (widgets: readonly AiWidget[]) => ReactNode;
  landingComposer?: ReactNode;
  onSendPrompt?: (text: string) => void;
  onEditMessage?: (messageId: string, newText: string) => void;
  feedback?: Readonly<Record<string, "like" | "dislike">>;
  onFeedback?: (messageId: string, type: "like" | "dislike") => void;
  onShareAnswer?: (messageId: string) => void;
  onRetryAnswer?: () => void;
};

type TextSegment =
  | { kind: "text"; text: string }
  | { kind: "code"; code: string; language: string };

/** Área de foco de los botones de sólo icono. */
const FOCUS_RING = "outline-none focus-visible:ring-4 focus-visible:ring-fg/20";

const ACTION_BUTTON = cn(
  "inline-flex size-8 items-center justify-center rounded-lg text-fg-muted transition",
  "hover:bg-surface-1 hover:text-fg",
  FOCUS_RING,
  "motion-reduce:transition-none",
);

function extrasOf(message: ChatMessage): MessageExtras {
  return message as ChatMessage & MessageExtras;
}

/** Parte el texto del asistente en tramos de prosa y bloques ```lenguaje … ```. */
function splitAssistantText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const pattern = new RegExp("```(\\w*)\\n?([\\s\\S]*?)```", "g");
  let cursor = 0;
  let match: RegExpExecArray | null = pattern.exec(text);

  while (match !== null) {
    if (match.index > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, match.index) });
    }
    const code = (match[2] ?? "").replace(/\n$/, "");
    segments.push({ kind: "code", code, language: detectCodeLanguage(code) });
    cursor = match.index + match[0].length;
    match = pattern.exec(text);
  }

  if (cursor < text.length) segments.push({ kind: "text", text: text.slice(cursor) });
  if (segments.length === 0) segments.push({ kind: "text", text });
  return segments;
}

function AssistantText({
  text,
  onFollowUp,
}: {
  text: string;
  onFollowUp: (prompt: string) => void;
}) {
  const segments = splitAssistantText(text);

  if (segments.length === 1 && segments[0]?.kind === "text") {
    return <RichAssistantMessage text={text} onFollowUp={onFollowUp} />;
  }

  let lastProse = -1;
  segments.forEach((segment, index) => {
    if (segment.kind === "text" && segment.text.trim().length > 0) lastProse = index;
  });

  return (
    <div className="flex w-full min-w-0 flex-col">
      {segments.map((segment, index) =>
        segment.kind === "code" ? (
          <CodeBlock
            key={`code-${index}`}
            code={segment.code}
            language={segment.language}
            showLineNumbers
          />
        ) : segment.text.trim().length > 0 ? (
          <RichAssistantMessage
            key={`text-${index}`}
            text={segment.text}
            onFollowUp={index === lastProse ? onFollowUp : undefined}
          />
        ) : null,
      )}
    </div>
  );
}

function UserBubble({
  message,
  onEditMessage,
}: {
  message: ChatMessage;
  onEditMessage?: (messageId: string, newText: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  const isLong = message.text.length > 500 || message.text.split("\n").length > 6;
  const isCollapsed = isLong && !expanded;

  async function copyMessage() {
    if (typeof navigator === "undefined") return;
    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") return;

    try {
      await clipboard.writeText(message.text);
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setCopied(false);
        timer.current = null;
      }, 2000);
    } catch {
      setCopied(false);
    }
  }

  function startEditing() {
    setDraft(message.text);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setDraft(message.text);
  }

  function saveEditing() {
    const next = draft.trim();
    if (!next) return;
    setEditing(false);
    if (next === message.text.trim()) return;
    onEditMessage?.(message.id, next);
  }

  return (
    <div className="group flex w-full flex-col items-end">
      {editing ? (
        <div className="w-full min-w-[min(100%,280px)] rounded-3xl border border-border/70 bg-white px-4 py-3 motion-safe:animate-fade-in motion-reduce:animate-none sm:min-w-[340px]">
          <textarea
            value={draft}
            rows={2}
            aria-label="Editar mensaje"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
              } else if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                saveEditing();
              }
            }}
            className="w-full resize-none bg-transparent text-[14.5px] leading-[1.6] text-fg outline-none placeholder:text-fg-muted"
          />
          <div className="mt-2 flex items-center justify-end gap-2 border-t border-border/60 pt-2">
            <button
              type="button"
              onClick={cancelEditing}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium text-fg-muted transition hover:text-fg",
                FOCUS_RING,
                "motion-reduce:transition-none",
              )}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveEditing}
              disabled={!draft.trim()}
              className={cn(
                "rounded-full bg-fg px-3.5 py-1.5 text-xs font-semibold text-bg transition disabled:opacity-40",
                FOCUS_RING,
                "motion-reduce:transition-none",
              )}
            >
              Guardar y enviar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex max-w-[85%] flex-col items-end sm:max-w-[75%]">
            <div
              className={cn(
                "rounded-3xl rounded-br-lg border border-border/70 bg-surface-1 px-5 py-3.5 text-[14.5px] leading-[1.6] break-words whitespace-pre-wrap text-fg",
                isCollapsed && "max-h-[140px] overflow-hidden",
              )}
            >
              {message.text}
            </div>
            {isLong ? (
              <button
                type="button"
                onClick={() => setExpanded((previous) => !previous)}
                className={cn(
                  "mt-1.5 text-[12px] font-semibold text-fg-muted transition hover:text-fg",
                  FOCUS_RING,
                  "motion-reduce:transition-none",
                )}
              >
                {expanded ? "Ver menos ↑" : "Ver más →"}
              </button>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
            <button
              type="button"
              onClick={() => void copyMessage()}
              aria-label="Copiar mensaje"
              title="Copiar mensaje"
              className={ACTION_BUTTON}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
            {onEditMessage ? (
              <button
                type="button"
                onClick={startEditing}
                aria-label="Editar mensaje"
                title="Editar mensaje"
                className={ACTION_BUTTON}
              >
                <PencilIcon />
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export function Transcript({
  copy,
  messages,
  typing,
  announcement,
  onRetry,
  onSuggest,
  renderWidgets,
  landingComposer,
  onSendPrompt,
  onEditMessage,
  feedback,
  onFeedback,
  onShareAnswer,
  onRetryAnswer,
}: TranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const busy = typing;
  const isEmpty = messages.length === 0 && !busy;
  const [atBottom, setAtBottom] = useState(true);
  const signature = `${messages.length}:${busy ? "1" : "0"}:${messages[messages.length - 1]?.id ?? ""}`;

  useEffect(() => {
    const node = endRef.current;
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [signature]);

  const last = messages.length - 1;

  function sendPrompt(text: string) {
    const prompt = text.trim();
    if (!prompt) return;
    if (onSendPrompt) {
      onSendPrompt(prompt);
      return;
    }
    onSuggest?.("tesla", prompt);
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const panel = event.currentTarget;
    const nearBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 96;
    setAtBottom((previous) => (previous === nearBottom ? previous : nearBottom));
  }

  function scrollToEnd() {
    const node = endRef.current;
    if (!node) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <div
      onScroll={handleScroll}
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain",
        isEmpty
          ? "px-4 sm:px-6 lg:px-0 lg:pb-5"
          : "px-4 pt-4 pb-6 sm:px-6 sm:pt-6 sm:pb-8 lg:px-0 lg:pt-7 lg:pb-9",
      )}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {isEmpty ? (
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-1 py-6 text-center sm:py-10">
          <BrandFavicon className="w-12" />
          <p className="mt-5 max-w-[20ch] text-balance text-2xl leading-[1.12] font-semibold tracking-[-0.03em] text-fg sm:max-w-[28ch] sm:text-[30px]">
            {copy.emptyTitle}
          </p>
          <p className="mx-auto mt-2.5 max-w-[40ch] text-pretty text-sm leading-relaxed text-fg-muted sm:text-[15px]">
            {copy.emptyBody}
          </p>
          <div className="mt-5 w-full text-left sm:mt-6">
            <MarketPulseBar onSelectPrompt={sendPrompt} />
          </div>
          <div className="mt-4 w-full sm:mt-5">
            <WelcomeChips onSendMessage={sendPrompt} />
          </div>
          <div className="mt-4 w-full text-left sm:mt-5">
            <PromptSuggestions onSendMessage={sendPrompt} />
          </div>
          {landingComposer ? (
            <div className="mt-5 w-full min-w-0 sm:mt-6">{landingComposer}</div>
          ) : null}
        </div>
      ) : (
        <ol aria-label={copy.transcript} className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          {messages.map((message, index) => {
            const extras = extrasOf(message);
            const reasoning = extras.reasoningText ?? extras.reasoning ?? null;
            const sources = extras.sources;

            return (
              <li key={message.id} className="min-w-0">
                <span className="sr-only">{message.role === "user" ? copy.you : copy.assistant}</span>

                {message.notice ? (
                  <NoticeCard
                    notice={message.notice}
                    copy={copy}
                    onRetry={
                      index === last && message.notice.kind !== "not_configured" && !busy
                        ? onRetry
                        : undefined
                    }
                  />
                ) : null}

                {message.text && !message.notice ? (
                  message.role === "user" ? (
                    <UserBubble message={message} onEditMessage={onEditMessage} />
                  ) : (
                    <div className="w-full min-w-0 motion-safe:animate-fade-in motion-reduce:animate-none">
                      <div className="mb-2 flex items-center gap-2 px-0.5">
                        <BrandFavicon className="w-6" />
                        <span className="text-[10.5px] font-semibold tracking-[0.14em] text-fg-muted uppercase">
                          {copy.assistant}
                        </span>
                      </div>

                      {reasoning && reasoning.trim().length > 0 ? (
                        <div className="mb-2">
                          <ReasoningAccordion reasoning={reasoning} />
                        </div>
                      ) : null}

                      <div className="max-w-[68ch] text-[15px] leading-[1.75] text-fg-body sm:text-[15.5px]">
                        <AssistantText text={message.text} onFollowUp={sendPrompt} />
                      </div>

                      {sources && sources.length > 0 ? (
                        <div className="mt-3">
                          <SourcesList sources={sources} />
                        </div>
                      ) : null}

                      {message.widgets && message.widgets.length > 0 ? (
                        <div className="mt-4 w-full min-w-0">{renderWidgets(message.widgets)}</div>
                      ) : null}

                      <div className="mt-3">
                        <AssistantMessageActions
                          messageId={message.id}
                          content={message.text}
                          feedback={feedback?.[message.id] ?? null}
                          onFeedback={
                            onFeedback ? (type) => onFeedback(message.id, type) : undefined
                          }
                          onRetry={index === last ? onRetryAnswer : undefined}
                          onShare={onShareAnswer ? () => onShareAnswer(message.id) : undefined}
                        />
                      </div>
                    </div>
                  )
                ) : null}

                {message.imageDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={message.imageDataUrl}
                    alt={copy.photoAlt}
                    className={cn(
                      "mt-3 max-h-52 max-w-[85%] rounded-2xl border border-border/70 object-cover sm:max-h-60",
                      message.role === "user" ? "self-end" : "self-start",
                    )}
                  />
                ) : null}
              </li>
            );
          })}

          {busy ? (
            <li className="min-w-0 motion-safe:animate-pulse motion-reduce:animate-none">
              <GrokThinkingCard label={copy.typing} />
            </li>
          ) : null}
        </ol>
      )}

      {!isEmpty && !atBottom ? (
        <button
          type="button"
          onClick={scrollToEnd}
          aria-label="Ir al final"
          title="Ir al final"
          className={cn(
            "sticky bottom-3 z-10 mx-auto mt-2 flex size-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-white text-fg shadow-[0_10px_24px_-12px_rgba(12,15,20,0.45)]",
            "hover:bg-surface-1",
            FOCUS_RING,
            "motion-safe:animate-fade-in motion-reduce:animate-none",
          )}
        >
          <ArrowDownIcon />
        </button>
      ) : null}

      <div ref={endRef} className="h-px w-full" aria-hidden="true" />
    </div>
  );
}

function ArrowDownIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 3v10m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="5.25" y="5.25" width="7.5" height="7.5" rx="1.6" />
      <path d="M10.75 5.25v-1a1.5 1.5 0 0 0-1.5-1.5h-4a1.5 1.5 0 0 0-1.5 1.5v4a1.5 1.5 0 0 0 1.5 1.5h1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="m9.75 3.5 2.75 2.75M3 13l.6-3.4 6.9-6.9a1.6 1.6 0 0 1 2.25 0l.55.55a1.6 1.6 0 0 1 0 2.25l-6.9 6.9L3 13Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

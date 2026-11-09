"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";

import { CodeBlock, detectCodeLanguage } from "@/components/ai/code-block";
import type { AiWidget } from "@/components/ai/contract";
import { GrokThinkingCard } from "@/components/ai/grok-thinking-card";
import { AssistantMessageActions } from "@/components/ai/message-actions";
import type { ChatMessage } from "@/components/ai/model";
import { NoticeCard } from "@/components/ai/notices";
import { ReasoningAccordion } from "@/components/ai/reasoning-accordion";
import { RichAssistantMessage } from "@/components/ai/rich-message";
import { SourcesList } from "@/components/ai/tool-accordion";
import { WelcomeChips } from "@/components/ai/welcome-chips";
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

/** Botones de la burbuja del usuario; aparecen al pasar el cursor o al enfocar. */
const USER_ACTION_BUTTON = cn(
  "h-7 w-7 rounded-full text-zinc-500 hover:text-zinc-900 bg-white/90 backdrop-blur-xs shadow-xs border border-zinc-200/70",
  "inline-flex items-center justify-center transition",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20",
  "motion-reduce:transition-none",
);

/** Lectura segura en SSR: `window` sólo se toca dentro de efectos o handlers. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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
  busy,
}: {
  message: ChatMessage;
  onEditMessage?: (messageId: string, newText: string) => void;
  busy: boolean;
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
    if (!next || !onEditMessage) return;
    setEditing(false);
    if (next === message.text.trim()) return;
    onEditMessage(message.id, next);
  }

  return (
    <div
      data-user-msg-id={message.id}
      className="flex justify-end group/user-msg w-full scroll-mt-20"
    >
      <div className="relative flex flex-col items-end max-w-[85%] md:max-w-[75%]">
        {editing ? (
          <div className="w-full min-w-[min(100%,280px)] sm:min-w-[340px] bg-white border border-zinc-200/70 rounded-3xl px-4 py-3 shadow-md transition-colors focus-within:border-zinc-400">
            <textarea
              data-bare-input=""
              value={draft}
              rows={2}
              aria-label="Editar mensaje"
              placeholder="Edita tu mensaje..."
              onChange={(event) => {
                setDraft(event.target.value);
                const el = event.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEditing();
                } else if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  saveEditing();
                }
              }}
              className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400 scrollbar-hide"
            />
            <div className="flex items-center justify-end gap-2 mt-2 pt-1 border-t border-zinc-200/60">
              <button
                type="button"
                onClick={cancelEditing}
                className="h-7 px-3 rounded-full text-xs font-medium text-zinc-500 transition hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:outline-none motion-reduce:transition-none"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEditing}
                disabled={!draft.trim() || !onEditMessage}
                className="rounded-full bg-zinc-900 text-white px-3.5 py-1.5 text-xs font-semibold transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:outline-none disabled:opacity-40 motion-reduce:transition-none"
              >
                Guardar y enviar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-zinc-100/90 text-zinc-900 text-[15px] relative overflow-hidden rounded-3xl px-5 py-3.5 shadow-2xs border border-zinc-200/60">
              <div
                className={cn(
                  "relative transition-all duration-300 motion-reduce:transition-none",
                  isCollapsed && "max-h-[140px] overflow-hidden",
                )}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
                {isCollapsed ? (
                  <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-zinc-100 via-zinc-100/90 to-transparent pointer-events-none" />
                ) : null}
              </div>

              {isLong ? (
                <div className="flex justify-end mt-2 pr-1">
                  <button
                    type="button"
                    onClick={() => setExpanded((previous) => !previous)}
                    className="text-xs font-semibold text-zinc-900 hover:opacity-75 transition-all flex items-center gap-1 cursor-pointer select-none motion-reduce:transition-none"
                  >
                    {expanded ? "Ver menos ↑" : "Ver más →"}
                  </button>
                </div>
              ) : null}
            </div>

            <div
              className={cn(
                "flex items-center gap-1 z-10 transition-all duration-200 motion-reduce:transition-none",
                "absolute top-full right-0 mt-1",
                "opacity-0 pointer-events-none",
                "group-hover/user-msg:opacity-100 group-hover/user-msg:pointer-events-auto",
                "focus-within:opacity-100 focus-within:pointer-events-auto",
              )}
            >
              <button
                type="button"
                onClick={() => void copyMessage()}
                aria-label="Copiar mensaje"
                title="Copiar"
                className={USER_ACTION_BUTTON}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
              <button
                type="button"
                onClick={startEditing}
                disabled={busy}
                aria-label="Editar mensaje"
                title="Editar"
                className={cn(USER_ACTION_BUTTON, "disabled:pointer-events-none disabled:opacity-40")}
              >
                <PencilIcon />
              </button>
            </div>
          </>
        )}
      </div>
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
  const hasMessages = messages.length > 0;
  const [atBottom, setAtBottom] = useState(true);
  const signature = `${messages.length}:${busy ? "1" : "0"}:${messages[messages.length - 1]?.id ?? ""}`;

  useEffect(() => {
    if (!hasMessages) return;
    const node = endRef.current;
    if (!node) return;
    const reduce = prefersReducedMotion();
    node.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [hasMessages, signature]);

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
    node.scrollIntoView({ block: "end", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {isEmpty ? (
        <div onScroll={handleScroll} className="flex-1 flex flex-col items-center justify-start px-4 pt-[16vh] sm:pt-[20vh] pb-6 relative min-h-full overflow-x-hidden overflow-y-auto scrollbar-hide">
          <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-start">
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="text-center mb-8"
            >
              <div className="flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/maverlang-logo.png"
                  alt="Maverlang Logo"
                  className="h-12 sm:h-14 w-auto object-contain select-none pointer-events-none"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
              className="w-full max-w-3xl"
            >
              {landingComposer}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
              className="w-full mt-3 flex justify-center"
            >
              <WelcomeChips onSendMessage={sendPrompt} />
            </motion.div>
          </div>
        </div>
      ) : (
        <div
          data-ai-scroll
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-hide px-4 md:px-6"
        >
          <ol
            aria-label={copy.transcript}
            className="pt-14 pb-24 md:pb-8 space-y-6 max-w-3xl mx-auto w-full"
          >
            {messages.map((message, index) => {
              const extras = extrasOf(message);
              const reasoning = extras.reasoningText ?? extras.reasoning ?? null;
              const sources = extras.sources;

              return (
                <li key={message.id} className="min-w-0">
                  <span className="sr-only">
                    {message.role === "user" ? copy.you : copy.assistant}
                  </span>

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

                  {message.role === "user" && message.text && !message.notice ? (
                    <UserBubble message={message} onEditMessage={onEditMessage} busy={busy} />
                  ) : null}

                  {message.role === "assistant" && !message.notice ? (
                    <div className="flex group/assistant gap-3.5 w-full items-start">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 select-none pointer-events-none">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/assets/Maverlang Logo-2.png"
                          alt="AI Assistant"
                          className={cn(
                            "w-6 h-6 object-contain",
                            busy && index === last && "animate-pulse",
                          )}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        {sources && sources.length > 0 ? (
                          <div className="mb-3">
                            <SourcesList sources={sources} />
                          </div>
                        ) : null}

                        {reasoning && reasoning.trim().length > 0 ? (
                          <div className="mb-2">
                            <ReasoningAccordion
                              reasoning={reasoning}
                              isStreaming={busy && index === last}
                            />
                          </div>
                        ) : null}

                        <div className="text-zinc-900 leading-relaxed text-[15px]">
                          <AssistantText text={message.text} onFollowUp={sendPrompt} />
                        </div>

                        {message.widgets && message.widgets.length > 0 ? (
                          <div className="mt-4 w-full min-w-0">{renderWidgets(message.widgets)}</div>
                        ) : null}

                        <div className="mt-2.5 opacity-0 group-hover/assistant:opacity-100 focus-within:opacity-100 transition-opacity duration-200 motion-reduce:transition-none">
                          <AssistantMessageActions
                            messageId={message.id}
                            content={message.text}
                            feedback={feedback?.[message.id] ?? null}
                            onFeedback={(type) => onFeedback?.(message.id, type)}
                            onRetry={onRetryAnswer}
                            onShare={onShareAnswer ? () => onShareAnswer(message.id) : undefined}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {message.imageDataUrl ? (
                    <div
                      className={cn(
                        "mt-3 flex",
                        message.role === "user" ? "justify-end" : "justify-start",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={message.imageDataUrl}
                        alt={copy.photoAlt}
                        className="max-h-52 max-w-[85%] rounded-2xl border border-zinc-200/70 object-cover sm:max-h-60"
                      />
                    </div>
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

          <div ref={endRef} className="h-px w-full" aria-hidden="true" />
        </div>
      )}

      <AnimatePresence>
        {!isEmpty && !atBottom ? (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToEnd}
            aria-label="Ir al final"
            title="Ir al final"
            className="absolute bottom-6 right-6 md:right-10 z-30 w-9 h-9 bg-zinc-900 text-white rounded-full shadow-lg flex items-center justify-center cursor-pointer border border-zinc-800 hover:opacity-90 active:scale-95"
          >
            <ArrowDownIcon />
          </motion.button>
        ) : null}
      </AnimatePresence>
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
      className="size-3.5"
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
      className="size-3.5"
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
      className="size-3.5"
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

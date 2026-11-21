"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";

import { CodeBlock, detectCodeLanguage } from "@/components/ai/code-block";
import type { AiWidget } from "@/components/ai/contract";
import { deriveFollowUps } from "@/components/ai/follow-ups";
import { GrokThinkingCard } from "@/components/ai/grok-thinking-card";
import { InteractiveQuestionCard } from "@/components/ai/interactive-question-card";
import { AssistantMessageActions } from "@/components/ai/message-actions";
import type { ChatMessage } from "@/components/ai/model";
import { NoticeCard } from "@/components/ai/notices";
import { ReasoningAccordion } from "@/components/ai/reasoning-accordion";
import { RichAssistantMessage } from "@/components/ai/rich-message";
import { SourcesList } from "@/components/ai/tool-accordion";
import { WelcomeChips } from "@/components/ai/welcome-chips";
import { IconCheck, IconCopy } from "@/components/ui/icons";
import { asistenteCopy, type AsistenteCopy, type AsistenteSuggestionId } from "@/content/i18n/extra-asistente";
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
  /** Si llega, la última respuesta ofrece preguntas de seguimiento tocables. */
  onFollowUp?: (text: string) => void;
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

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Botones de la burbuja del usuario; aparecen al pasar el cursor o al enfocar. */
const USER_ACTION_BUTTON =
  "inline-flex size-11 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-fg disabled:cursor-default disabled:opacity-45 motion-reduce:transition-none sm:size-8";

/** Lectura segura en SSR: `window` sólo se toca dentro de efectos o handlers. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function extrasOf(message: ChatMessage): MessageExtras {
  return message as ChatMessage & MessageExtras;
}

/**
 * Preguntas de seguimiento de la ÚLTIMA respuesta del asistente. Se calculan
 * sólo con lo que ya está en pantalla (widgets y último mensaje del usuario);
 * nunca se ofrecen durante la transmisión ni sobre un aviso de error.
 */
type FollowUpState = {
  index: number;
  items: string[];
  onSelect: (text: string) => void;
};

function buildFollowUpState(
  messages: readonly ChatMessage[],
  busy: boolean,
  onFollowUp: ((text: string) => void) | undefined,
): FollowUpState | null {
  if (!onFollowUp || busy) return null;

  let index = -1;
  for (let cursor = messages.length - 1; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor];
    if (candidate?.role === "assistant") {
      index = cursor;
      break;
    }
  }
  if (index < 0) return null;

  const last = messages[index];
  if (!last || last.notice || last.text.trim().length === 0) return null;

  let lastUserText = "";
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor];
    if (candidate?.role === "user" && candidate.text.trim().length > 0) {
      lastUserText = candidate.text;
      break;
    }
  }

  const items = deriveFollowUps(last.widgets ?? [], lastUserText);
  if (items.length === 0) return null;

  return { index, items, onSelect: onFollowUp };
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
  cursor,
}: {
  text: string;
  onFollowUp?: (prompt: string) => void;
  cursor?: ReactNode;
}) {
  const segments = splitAssistantText(text);

  if (segments.length === 1 && segments[0]?.kind === "text") {
    return <RichAssistantMessage text={text} onFollowUp={onFollowUp} cursor={cursor} />;
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
            cursor={index === lastProse ? cursor : undefined}
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
  en,
}: {
  message: ChatMessage;
  onEditMessage?: (messageId: string, newText: string) => void;
  busy: boolean;
  en: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

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
    if (busy) return;
    setDraft(message.text);
    setEditing(true);
    requestAnimationFrame(() => draftRef.current?.focus());
  }

  function cancelEditing() {
    setEditing(false);
    setDraft(message.text);
    requestAnimationFrame(() => editButtonRef.current?.focus({ preventScroll: true }));
  }

  function saveEditing() {
    const next = draft.trim();
    if (busy || !next || !onEditMessage) return;
    setEditing(false);
    requestAnimationFrame(() => editButtonRef.current?.focus({ preventScroll: true }));
    if (next === message.text.trim()) return;
    onEditMessage(message.id, next);
  }

  return (
    <div
      data-user-msg-id={message.id}
      className="flex w-full scroll-mt-20 justify-end"
    >
      <div className={cn("group/user-msg flex min-w-0 max-w-[92%] flex-col items-end sm:max-w-[min(84%,42rem)]", editing && "w-full")}>
        {editing ? (
          <div className="w-full rounded-3xl border border-control/60 bg-bg px-4 py-3 shadow-raised transition-colors focus-within:border-fg/50 sm:px-5">
            <textarea
              ref={draftRef}
              data-bare-input=""
              value={draft}
              rows={2}
              aria-label={en ? "Edit message" : "Editar mensaje"}
              placeholder={en ? "Edit your message…" : "Edita tu mensaje…"}
              onChange={(event) => {
                setDraft(event.target.value);
                const el = event.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEditing();
                } else if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  saveEditing();
                }
              }}
              className="w-full resize-none bg-transparent text-[16px] leading-relaxed text-zinc-900 outline-none placeholder:text-fg-subtle scrollbar-hide sm:text-[15px]"
            />
            <div className="flex items-center justify-end gap-2 mt-2 pt-1 border-t border-zinc-200/60">
              <button
                type="button"
                onClick={cancelEditing}
                className="h-11 px-3 rounded-full text-xs font-medium text-zinc-600 transition hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:outline-none sm:h-8 motion-reduce:transition-none"
              >
                {en ? "Cancel" : "Cancelar"}
              </button>
              <button
                type="button"
                onClick={saveEditing}
                disabled={busy || !draft.trim() || !onEditMessage}
                className="min-h-11 rounded-full bg-zinc-900 text-white px-3.5 py-1.5 text-xs font-semibold transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:outline-none disabled:opacity-40 sm:min-h-8 motion-reduce:transition-none"
              >
                {en ? "Save and send" : "Guardar y enviar"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="max-w-full overflow-hidden rounded-3xl border border-border bg-bg px-4 py-3 text-[15px] text-fg shadow-raised sm:px-5 sm:text-base">
              <div
                className={cn(
                  "relative transition-all duration-300 motion-reduce:transition-none",
                  isCollapsed && "max-h-[140px] overflow-hidden",
                )}
              >
                <p className="whitespace-pre-wrap leading-6 [overflow-wrap:anywhere]">{message.text}</p>
                {isCollapsed ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-bg via-bg/90 to-transparent" />
                ) : null}
              </div>

              {isLong ? (
                <div className="flex justify-end mt-2 pr-1">
                  <button
                    type="button"
                    onClick={() => setExpanded((previous) => !previous)}
                    className="min-h-9 px-1 text-xs font-semibold text-zinc-900 hover:opacity-75 transition-all flex items-center gap-1 cursor-pointer select-none motion-reduce:transition-none"
                  >
                    {expanded ? (en ? "Show less ↑" : "Ver menos ↑") : en ? "Show more →" : "Ver más →"}
                  </button>
                </div>
              ) : null}
            </div>

            <div
              role="group"
              aria-label={en ? "Message actions" : "Acciones del mensaje"}
              className="mt-0.5 flex items-center gap-0.5 pr-1 transition-opacity [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover/user-msg:opacity-100 group-has-[:focus-visible]/user-msg:opacity-100 motion-reduce:transition-none"
            >
              <button
                type="button"
                onClick={() => void copyMessage()}
                aria-label={en ? "Copy message" : "Copiar mensaje"}
                title={copied ? (en ? "Copied" : "Copiado") : (en ? "Copy" : "Copiar")}
                className={cn(USER_ACTION_BUTTON, copied && "text-up hover:text-up")}
              >
                {copied ? <IconCheck /> : <IconCopy />}
              </button>
              {onEditMessage ? (
                <button
                  ref={editButtonRef}
                  type="button"
                  onClick={startEditing}
                  disabled={busy}
                  aria-label={en ? "Edit message" : "Editar mensaje"}
                  title={en ? "Edit" : "Editar"}
                  className={USER_ACTION_BUTTON}
                >
                  <PencilIcon />
                </button>
              ) : null}
              <span className="sr-only" role="status">{copied ? (en ? "Message copied" : "Mensaje copiado") : ""}</span>
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
  onFollowUp,
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

  const followUpState = buildFollowUpState(messages, busy, onFollowUp);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {isEmpty ? (
        <div onScroll={handleScroll} className="flex-1 flex flex-col items-center justify-start px-4 pt-[16vh] sm:pt-[20vh] pb-6 relative min-h-full overflow-x-hidden overflow-y-auto scrollbar-hide">
          <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-start">
            <motion.div
              initial={prefersReducedMotion() ? false : { opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, ease: EASE_OUT }}
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
              initial={prefersReducedMotion() ? false : { opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.08 }}
              className="w-full max-w-3xl"
            >
              {landingComposer}
            </motion.div>

            <motion.div
              initial={prefersReducedMotion() ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.16 }}
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
            className="mx-auto w-full max-w-3xl space-y-5 pt-16 pb-24 sm:space-y-7 sm:pt-14 md:pb-8"
          >
            {messages.map((message, index) => {
              const extras = extrasOf(message);
              const reasoning = extras.reasoningText ?? extras.reasoning ?? null;
              const sources = extras.sources;
              const isLastAssistant = index === last && message.role === "assistant";
              const isStreamingCurrent = busy && isLastAssistant && (Boolean(message.text?.trim()) || Boolean(message.widgets?.length));

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
                    <UserBubble message={message} onEditMessage={onEditMessage} busy={busy} en={copy === asistenteCopy.en} />
                  ) : null}

                  {message.role === "assistant" && !message.notice ? (
                    <div className="w-full min-w-0">
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

                      <div className="max-w-[72ch] text-[15px] leading-relaxed text-fg sm:text-base">
                        <AssistantText
                          text={message.text}
                          onFollowUp={followUpState?.index === index ? undefined : sendPrompt}
                          cursor={
                            isStreamingCurrent ? (
                              <span
                                aria-hidden="true"
                                className="size-2 rounded-full bg-brand inline-block ml-1.5 align-middle motion-safe:animate-pulse"
                              />
                            ) : undefined
                          }
                        />
                      </div>

                      {message.widgets && message.widgets.length > 0 ? (
                        <div className="mt-4 w-full min-w-0">
                          {renderWidgets(message.widgets)}
                          {isStreamingCurrent && !message.text?.trim() ? (
                            <div className="mt-2">
                              <span
                                aria-hidden="true"
                                className="size-2 rounded-full bg-brand inline-block ml-1.5 align-middle motion-safe:animate-pulse"
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {followUpState && followUpState.index === index ? (
                        <div className="mt-4 w-full min-w-0">
                          <InteractiveQuestionCard
                            key={`${message.id}:${followUpState.items.join("|")}`}
                            variant="quick"
                            data={{
                              id: `seguimiento-${message.id}`,
                              question: "¿Qué te gustaría revisar ahora?",
                              options: followUpState.items.map((text, position) => ({
                                id: `seguimiento-${position + 1}`,
                                label: text,
                              })),
                              allowCustom: true,
                            }}
                            onSubmit={followUpState.onSelect}
                          />
                        </div>
                      ) : null}

                      <div className="mt-2.5">
                        <AssistantMessageActions
                          messageId={message.id}
                          en={copy === asistenteCopy.en}
                          content={message.text}
                          feedback={feedback?.[message.id] ?? null}
                          onFeedback={onFeedback ? (type) => onFeedback(message.id, type) : undefined}
                          onRetry={!busy && isLastAssistant ? onRetryAnswer : undefined}
                          onShare={onShareAnswer ? () => onShareAnswer(message.id) : undefined}
                        />
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

            {busy && !(messages[last]?.role === "assistant" && (Boolean(messages[last]?.text?.trim()) || Boolean(messages[last]?.widgets?.length))) ? (
              <li className="min-w-0">
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
            initial={prefersReducedMotion() ? false : { opacity: 0, scale: 0.85, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion() ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 8 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            onClick={scrollToEnd}
            aria-label="Ir al final"
            title="Ir al final"
            className="absolute bottom-6 right-4 md:right-10 z-30 size-10 rounded-full bg-white/95 text-zinc-800 backdrop-blur-md shadow-md border border-border/80 flex items-center justify-center cursor-pointer transition-transform duration-200 hover:bg-white hover:scale-105 active:scale-95 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 motion-reduce:transition-none"
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

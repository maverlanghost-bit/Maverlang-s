"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Acciones por respuesta del asistente. Sin dependencias externas: los iconos
 * son SVG inline y la lectura en voz alta usa la Web Speech API del navegador,
 * así que en SSR sólo se renderizan los botones en estado reposo.
 */

/** Mismo estilo que `Action` en ai-chat-extracted (`ai/actions.tsx`). */
const ACTION_BUTTON =
  "size-11 sm:size-8 p-1 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-full inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/25";

const ICON_BASE = "size-3.5";

function Icon({
  children,
  className,
  filled = false,
}: {
  children: ReactNode;
  className?: string;
  filled?: boolean;
}): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn(ICON_BASE, className)}
    >
      {children}
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }): ReactElement {
  return (
    <Icon className={className}>
      <rect x="8" y="8" width="14" height="14" rx="2" />
      <path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" />
    </Icon>
  );
}

function CheckIcon({ className }: { className?: string }): ReactElement {
  return (
    <Icon className={className}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

function ThumbsUpIcon({
  className,
  filled = false,
}: {
  className?: string;
  filled?: boolean;
}): ReactElement {
  return (
    <Icon className={className} filled={filled}>
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </Icon>
  );
}

function ThumbsDownIcon({
  className,
  filled = false,
}: {
  className?: string;
  filled?: boolean;
}): ReactElement {
  return (
    <Icon className={className} filled={filled}>
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </Icon>
  );
}

function RotateIcon({ className }: { className?: string }): ReactElement {
  return (
    <Icon className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  );
}

function ShareIcon({ className }: { className?: string }): ReactElement {
  return (
    <Icon className={className}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.59 13.51 6.83 3.98" />
      <path d="m15.41 6.51-6.82 3.98" />
    </Icon>
  );
}

function SpeakerIcon({ className }: { className?: string }): ReactElement {
  return (
    <Icon className={className}>
      <path d="M11 5 6.5 8.5H3v7h3.5L11 19V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </Icon>
  );
}

function StopIcon({ className }: { className?: string }): ReactElement {
  return (
    <Icon className={className}>
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </Icon>
  );
}

/** Quita el markdown básico para que la síntesis no lea símbolos ni URLs. */
function toSpeechText(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*`#]/g, "")
    .replace(/^\s*-\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  const synthesis = window.speechSynthesis;
  if (!synthesis || typeof SpeechSynthesisUtterance === "undefined") return null;
  return synthesis;
}

export function SpeakAction({ text }: { text: string }): ReactElement {
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Sólo cleanup: al desmontar se corta cualquier lectura en curso.
  useEffect(
    () => () => {
      utteranceRef.current = null;
      try {
        getSynthesis()?.cancel();
      } catch {
        // El navegador puede rechazar cancel() sin voz activa; no hay nada que hacer.
      }
    },
    [],
  );

  function stop(): void {
    utteranceRef.current = null;
    try {
      getSynthesis()?.cancel();
    } catch {
      // Idem: si falla, igual volvemos al estado reposo.
    }
    setSpeaking(false);
  }

  function handleClick(): void {
    if (speaking) {
      stop();
      return;
    }

    const synthesis = getSynthesis();
    if (!synthesis) return;

    const spoken = toSpeechText(text);
    if (spoken.length === 0) return;

    try {
      synthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.lang = "es-CL";
      const chileanVoice = synthesis.getVoices().find((voice) => voice.lang?.toLowerCase() === "es-cl");
      // Si no hay voz es-CL dejamos `lang` tal cual y el navegador elige la más cercana.
      if (chileanVoice) utterance.voice = chileanVoice;

      utterance.onend = () => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        setSpeaking(false);
      };
      utterance.onerror = () => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        setSpeaking(false);
      };

      utteranceRef.current = utterance;
      synthesis.speak(utterance);
      setSpeaking(true);
    } catch {
      stop();
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={speaking ? "Detener lectura" : "Escuchar respuesta"}
      title={speaking ? "Detener lectura" : "Escuchar respuesta"}
      aria-pressed={speaking}
      data-speak-state={speaking ? "speaking" : "idle"}
      className={cn(ACTION_BUTTON, speaking && "text-zinc-900")}
    >
      {speaking ? <StopIcon className="motion-safe:animate-pulse motion-reduce:animate-none" /> : <SpeakerIcon />}
    </button>
  );
}

export function AssistantMessageActions({
  messageId,
  content,
  feedback,
  onFeedback,
  onRetry,
  onShare,
}: {
  messageId: string;
  content: string;
  feedback?: "like" | "dislike" | null;
  onFeedback?: (type: "like" | "dislike") => void;
  onRetry?: () => void;
  onShare?: () => void;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    },
    [],
  );

  async function handleCopy(): Promise<void> {
    try {
      if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") return;
      await navigator.clipboard.writeText(content);
    } catch {
      return;
    }

    setCopied(true);
    if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      copyTimerRef.current = null;
      setCopied(false);
    }, 2000);
  }

  const liked = feedback === "like";
  const disliked = feedback === "dislike";

  return (
    <div
      id={`message-actions-${messageId}`}
      data-message-id={messageId}
      data-ai-message-actions=""
      role="group"
      aria-label="Acciones de la respuesta"
      className="flex items-center gap-0.5"
    >
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label="Copiar respuesta"
        title={copied ? "¡Copiado!" : "Copiar respuesta"}
        className={cn(ACTION_BUTTON, copied && "text-emerald-600 hover:text-emerald-600")}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>

      <button
        type="button"
        onClick={() => onFeedback?.("like")}
        aria-label="Respuesta útil"
        title="Respuesta útil"
        aria-pressed={liked}
        className={cn(ACTION_BUTTON, liked && "text-zinc-900")}
      >
        <ThumbsUpIcon filled={liked} className={liked ? "fill-zinc-900" : undefined} />
      </button>

      <button
        type="button"
        onClick={() => onFeedback?.("dislike")}
        aria-label="Respuesta poco útil"
        title="Respuesta poco útil"
        aria-pressed={disliked}
        className={cn(ACTION_BUTTON, disliked && "text-zinc-900")}
      >
        <ThumbsDownIcon filled={disliked} className={disliked ? "fill-zinc-900" : undefined} />
      </button>

      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          aria-label="Regenerar respuesta"
          title="Regenerar respuesta"
          className={ACTION_BUTTON}
        >
          <RotateIcon />
        </button>
      ) : null}

      <SpeakAction text={content} />

      {onShare ? (
        <button
          type="button"
          onClick={onShare}
          aria-label="Compartir respuesta"
          title="Compartir respuesta"
          className={ACTION_BUTTON}
        >
          <ShareIcon />
        </button>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { NoticeCard } from "@/components/ai/notices";
import type { ChatMessage } from "@/components/ai/model";
import { cn } from "@/lib/cn";
import type { AsistenteCopy } from "@/content/i18n/extra-asistente";
import type { AiWidget } from "@/components/ai/contract";

export function Transcript({
  copy,
  messages,
  typing,
  announcement,
  onRetry,
  renderWidgets,
}: {
  copy: AsistenteCopy;
  messages: readonly ChatMessage[];
  typing: boolean;
  announcement: string;
  onRetry: () => void;
  renderWidgets: (widgets: readonly AiWidget[]) => ReactNode;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const busy = typing;
  const signature = `${messages.length}:${busy ? "1" : "0"}:${messages[messages.length - 1]?.id ?? ""}`;

  useEffect(() => {
    const node = endRef.current;
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [signature]);

  const last = messages.length - 1;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {messages.length === 0 && !busy ? (
        <div className="flex h-full min-h-56 flex-col items-center justify-center px-4 text-center">
          <div className="max-w-sm rounded-3xl border border-border/80 bg-bg-elevated/85 px-6 py-7 shadow-[0_18px_44px_-18px_rgba(12,15,20,0.1)] backdrop-blur-xl">
            <div
              aria-hidden="true"
              className="relative mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl border border-brand/25 bg-gradient-to-br from-brand/20 via-brand-soft to-amber-500/10 text-brand shadow-[0_8px_28px_-6px_rgba(5,150,105,0.28)]"
            >
              <SparkleIcon />
            </div>
            <p className="text-xl font-semibold tracking-tight text-fg">{copy.emptyTitle}</p>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-fg-muted">{copy.emptyBody}</p>
          </div>
        </div>
      ) : (
        <ol aria-label={copy.transcript} className="flex flex-col gap-3.5">
          {messages.map((message, index) => (
            <li
              key={message.id}
              className={cn(
                "min-w-0",
                message.role === "user" ? "flex flex-col items-end" : "flex flex-col items-stretch",
              )}
            >
              <span className="sr-only">{message.role === "user" ? copy.you : copy.assistant}</span>
              {message.notice ? (
                <NoticeCard
                  notice={message.notice}
                  copy={copy}
                  onRetry={index === last && message.notice.kind !== "not_configured" && !busy ? onRetry : undefined}
                />
              ) : null}
              {message.text && !message.notice ? (
                message.role === "user" ? (
                  <p className="max-w-[85%] rounded-[22px] rounded-br-md bg-gradient-to-br from-fg to-fg/90 px-4 py-2.5 text-[14px] leading-relaxed break-words whitespace-pre-wrap text-bg shadow-[0_8px_22px_-8px_rgba(12,15,20,0.25)] motion-safe:animate-fade-in motion-reduce:animate-none">
                    {message.text}
                  </p>
                ) : (
                  <div className="max-w-[90%] rounded-[22px] rounded-bl-md border border-border/85 bg-bg-elevated/95 px-4 py-3 text-[14px] leading-relaxed text-fg shadow-[0_8px_26px_-12px_rgba(12,15,20,0.08)] backdrop-blur-md motion-safe:animate-fade-in motion-reduce:animate-none">
                    <div
                      aria-hidden="true"
                      className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-fg-muted uppercase"
                    >
                      <span className="size-1.5 rounded-full bg-brand shadow-[0_0_6px_rgba(5,150,105,0.7)]" />
                      <span>{copy.assistant}</span>
                    </div>
                    <p className="break-words whitespace-pre-wrap">{message.text}</p>
                  </div>
                )
              ) : null}
              {message.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={message.imageDataUrl}
                  alt={copy.photoAlt}
                  className="mt-2 max-h-40 max-w-[85%] rounded-2xl border border-border/70 object-cover shadow-sm"
                />
              ) : null}
              {message.widgets && message.widgets.length > 0 ? (
                <div className="mt-2.5 w-full min-w-0">{renderWidgets(message.widgets)}</div>
              ) : null}
            </li>
          ))}
          {busy ? (
            <li>
              <Typing label={copy.typing} />
            </li>
          ) : null}
        </ol>
      )}
      <div ref={endRef} />
    </div>
  );
}

function Typing({ label }: { label: string }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-[22px] rounded-bl-md border border-border/85 bg-bg-elevated/95 px-4 py-3 text-sm text-fg-muted shadow-[0_8px_26px_-12px_rgba(12,15,20,0.08)] backdrop-blur-md">
      <span className="inline-flex items-center gap-1" aria-hidden>
        <Dot delay="0ms" />
        <Dot delay="160ms" />
        <Dot delay="320ms" />
      </span>
      <span>{label}</span>
    </p>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-1.5 rounded-full bg-brand motion-safe:animate-pulse motion-reduce:animate-none"
      style={{ animationDelay: delay }}
    />
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true">
      <path
        d="M12 3.25c.45 3.6 1.95 5.1 5.55 5.55-3.6.45-5.1 1.95-5.55 5.55-.45-3.6-1.95-5.1-5.55-5.55 3.6-.45 5.1-1.95 5.55-5.55Z"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M18.25 14.5c.22 1.75.95 2.48 2.7 2.7-1.75.22-2.48.95-2.7 2.7-.22-1.75-.95-2.48-2.7-2.7 1.75-.22 2.48-.95 2.7-2.7ZM6.25 15.25c.18 1.35.75 1.92 2.1 2.1-1.35.18-1.92.75-2.1 2.1-.18-1.35-.75-1.92-2.1-2.1 1.35-.18 1.92-.75 2.1-2.1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

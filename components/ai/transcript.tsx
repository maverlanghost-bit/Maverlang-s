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
  const signature = `${messages.length}:${typing ? "1" : "0"}:${messages[messages.length - 1]?.id ?? ""}`;

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
      {messages.length === 0 && !typing ? (
        <div className="flex h-full min-h-48 flex-col items-center justify-center px-4 text-center">
          <p className="text-xl font-semibold tracking-tight text-fg">{copy.emptyTitle}</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-fg-muted">{copy.emptyBody}</p>
        </div>
      ) : (
        <ol aria-label={copy.transcript} className="flex flex-col gap-3">
          {messages.map((message, index) => (
            <li key={message.id} className={cn("min-w-0", message.role === "user" ? "flex flex-col items-end" : "flex flex-col items-stretch")}>
              <span className="sr-only">{message.role === "user" ? copy.you : copy.assistant}</span>
              {message.notice ? (
                <NoticeCard
                  notice={message.notice}
                  copy={copy}
                  onRetry={index === last && message.notice.kind !== "not_configured" && !typing ? onRetry : undefined}
                />
              ) : null}
              {message.text && !message.notice ? (
                <p
                  className={cn(
                    "max-w-[85%] rounded-[1.25rem] px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap motion-safe:animate-fade-in motion-reduce:animate-none",
                    message.role === "user"
                      ? "rounded-br-md bg-fg text-white"
                      : "rounded-bl-md bg-surface-2 text-fg-body",
                  )}
                >
                  {message.text}
                </p>
              ) : null}
              {message.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={message.imageDataUrl}
                  alt={copy.photoAlt}
                  className="mt-2 max-h-40 max-w-[85%] rounded-2xl object-cover"
                />
              ) : null}
              {message.widgets && message.widgets.length > 0 ? (
                <div className="mt-2 w-full min-w-0">{renderWidgets(message.widgets)}</div>
              ) : null}
            </li>
          ))}
          {typing ? (
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
    <p className="inline-flex items-center gap-2 rounded-[1.25rem] rounded-bl-md bg-surface-2 px-4 py-3 text-sm text-fg-muted">
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
      className="size-1.5 rounded-full bg-fg-muted motion-safe:animate-pulse motion-reduce:animate-none"
      style={{ animationDelay: delay }}
    />
  );
}

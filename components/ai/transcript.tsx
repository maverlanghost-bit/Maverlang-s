"use client";

import { useEffect, useRef, type ReactNode } from "react";

import type { AiWidget } from "@/components/ai/contract";
import type { ChatMessage } from "@/components/ai/model";
import { NoticeCard } from "@/components/ai/notices";
import type { AsistenteCopy, AsistenteSuggestionId } from "@/content/i18n/extra-asistente";
import { cn } from "@/lib/cn";

export function Transcript({
  copy,
  messages,
  typing,
  announcement,
  onRetry,
  onSuggest,
  renderWidgets,
}: {
  copy: AsistenteCopy;
  messages: readonly ChatMessage[];
  typing: boolean;
  announcement: string;
  onRetry: () => void;
  onSuggest?: (id: AsistenteSuggestionId, text: string) => void;
  renderWidgets: (widgets: readonly AiWidget[]) => ReactNode;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const busy = typing;
  const isEmpty = messages.length === 0 && !busy;
  const signature = `${messages.length}:${busy ? "1" : "0"}:${messages[messages.length - 1]?.id ?? ""}`;

  useEffect(() => {
    const node = endRef.current;
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [signature]);

  const last = messages.length - 1;

  return (
    <div
      className={cn(
        "min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6",
        isEmpty ? "flex-1 lg:flex-none lg:pb-5" : "flex-1",
      )}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {isEmpty ? (
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center py-2 text-center lg:min-h-0">
          <div aria-hidden="true" className="relative mb-3 flex size-12 items-center justify-center lg:size-11">
            <div className="relative flex size-12 items-center justify-center rounded-2xl border border-border/75 bg-white text-fg shadow-xs lg:size-11">
              <SparkleIcon />
            </div>
          </div>
          <p className="text-2xl font-semibold tracking-tight text-fg sm:text-[32px]">{copy.emptyTitle}</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-muted sm:text-[15px]">
            {copy.emptyBody}
          </p>
          {onSuggest ? (
            <div className="mt-5 grid w-full grid-cols-1 gap-2 text-left sm:grid-cols-2 lg:hidden">
              {copy.suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSuggest(item.id, item.text)}
                  className="group flex items-start gap-3 rounded-2xl border border-border/75 bg-white/90 p-3 text-left shadow-2xs transition-all duration-200 hover:border-brand/40 hover:bg-white"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-soft/75 text-brand transition-colors group-hover:bg-brand group-hover:text-white"
                  >
                    <SuggestionBentoIcon id={item.id} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold leading-snug text-fg transition-colors group-hover:text-brand">
                      {item.text}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-medium text-fg-muted">
                      Consultar ahora →
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <ol aria-label={copy.transcript} className="mx-auto flex w-full max-w-2xl flex-col gap-4">
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
                  <p className="max-w-[85%] rounded-[22px] rounded-br-md bg-fg px-4 py-3 text-[14.5px] leading-relaxed break-words whitespace-pre-wrap text-bg shadow-xs motion-safe:animate-fade-in motion-reduce:animate-none">
                    {message.text}
                  </p>
                ) : (
                  <div className="w-full max-w-[94%] rounded-[24px] rounded-tl-md border border-border/80 bg-white p-4 text-[14.5px] leading-relaxed text-fg shadow-xs motion-safe:animate-fade-in motion-reduce:animate-none sm:p-5">
                    <div
                      aria-hidden="true"
                      className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold tracking-wider text-fg-muted uppercase"
                    >
                      <span className="flex size-5 items-center justify-center rounded-md bg-brand-soft text-brand">
                        <MiniSparkleIcon />
                      </span>
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
    <p className="inline-flex items-center gap-2 rounded-[22px] rounded-bl-md border border-border/80 bg-white px-4 py-3 text-sm text-fg-muted shadow-xs">
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
        fillOpacity="0.14"
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

function MiniSparkleIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
      <path
        d="M8 2.25c.3 2.4 1.3 3.4 3.7 3.7-2.4.3-3.4 1.3-3.7 3.7-.3-2.4-1.3-3.4-3.7-3.7 2.4-.3 3.4-1.3 3.7-3.7Z"
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SuggestionBentoIcon({ id }: { id: string }) {
  if (id === "tesla" || id === "stock") {
    return (
      <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
        <path
          d="M3.25 13.75 7.5 9.5l3 2.75 6.25-6.5M13.25 5.75h3.5v3.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (id === "compare") {
    return (
      <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
        <path
          d="M6.5 3.75v12.5M6.5 3.75 4 6.25M6.5 3.75 9 6.25M13.5 16.25V3.75M13.5 16.25 11 13.75M13.5 16.25 16 13.75"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (id === "portfolio") {
    return (
      <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
        <path
          d="M10 3.25a6.75 6.75 0 1 0 6.75 6.75H10V3.25Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M12.5 2.9A6.75 6.75 0 0 1 17.1 7.5H12.5V2.9Z"
          fill="currentColor"
          fillOpacity="0.2"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
      <path
        d="M7.25 4.25h5.5l1 1.6h2a1.5 1.5 0 0 1 1.5 1.5v7.4a1.5 1.5 0 0 1-1.5 1.5H4.25a1.5 1.5 0 0 1-1.5-1.5v-7.4a1.5 1.5 0 0 1 1.5-1.5h2l1-1.6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10.8" r="2.6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

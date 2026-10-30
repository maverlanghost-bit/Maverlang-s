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
  const signature = `${messages.length}:${busy ? "1" : "0"}:${messages[messages.length - 1]?.id ?? ""}`;

  useEffect(() => {
    const node = endRef.current;
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [signature]);

  const last = messages.length - 1;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {messages.length === 0 && !busy ? (
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center py-4 text-center">
          <div aria-hidden="true" className="relative mb-4 flex size-16 items-center justify-center">
            <div className="absolute -inset-2 rounded-3xl bg-gradient-to-tr from-brand/25 via-emerald-400/15 to-sky-400/20 blur-xl" />
            <div className="relative flex size-16 items-center justify-center rounded-[22px] border border-white/85 bg-gradient-to-br from-white/95 via-brand-soft/60 to-emerald-500/15 text-brand shadow-[0_16px_40px_-10px_rgba(5,150,105,0.32),inset_0_1.5px_0_rgba(255,255,255,0.95)]">
              <SparkleIcon />
            </div>
          </div>
          <p className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">{copy.emptyTitle}</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-muted sm:text-[15px]">
            {copy.emptyBody}
          </p>
          {onSuggest ? (
            <div className="mt-6 grid w-full grid-cols-1 gap-2.5 text-left sm:grid-cols-2">
              {copy.suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSuggest(item.id, item.text)}
                  className="group flex items-start gap-3 rounded-2xl border border-white/80 bg-white/80 p-3.5 text-left shadow-[0_8px_24px_-12px_rgba(12,15,20,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:bg-white/95 hover:shadow-[0_14px_32px_-12px_rgba(5,150,105,0.18)]"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft/75 text-brand transition-colors group-hover:bg-brand group-hover:text-white"
                  >
                    <SuggestionBentoIcon id={item.id} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold leading-snug text-fg transition-colors group-hover:text-brand">
                      {item.text}
                    </span>
                    <span className="mt-1 block text-[11px] font-medium text-fg-muted transition-colors group-hover:text-brand/80">
                      Consultar ahora →
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <ol aria-label={copy.transcript} className="mx-auto flex w-full max-w-3xl flex-col gap-4">
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
                  <p className="max-w-[85%] rounded-[22px] rounded-br-md bg-gradient-to-br from-fg via-fg/95 to-fg/90 px-4 py-3 text-[14.5px] leading-relaxed break-words whitespace-pre-wrap text-bg shadow-[0_10px_26px_-10px_rgba(12,15,20,0.28)] motion-safe:animate-fade-in motion-reduce:animate-none">
                    {message.text}
                  </p>
                ) : (
                  <div className="w-full max-w-[92%] rounded-[24px] rounded-tl-md border border-white/85 bg-white/92 p-4 text-[14.5px] leading-relaxed text-fg shadow-[0_12px_34px_-14px_rgba(12,15,20,0.09),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl motion-safe:animate-fade-in motion-reduce:animate-none sm:p-5">
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
    <p className="inline-flex items-center gap-2 rounded-[22px] rounded-bl-md border border-white/85 bg-white/92 px-4 py-3 text-sm text-fg-muted shadow-[0_12px_34px_-14px_rgba(12,15,20,0.09)] backdrop-blur-xl">
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
    <svg viewBox="0 0 24 24" className="size-7" fill="none" aria-hidden="true">
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
      <svg viewBox="0 0 20 20" className="size-4.5" fill="none" aria-hidden="true">
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
      <svg viewBox="0 0 20 20" className="size-4.5" fill="none" aria-hidden="true">
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
      <svg viewBox="0 0 20 20" className="size-4.5" fill="none" aria-hidden="true">
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
    <svg viewBox="0 0 20 20" className="size-4.5" fill="none" aria-hidden="true">
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

"use client";

import { useEffect, useRef, type ReactNode } from "react";

import type { AiWidget } from "@/components/ai/contract";
import { GrokThinkingCard } from "@/components/ai/grok-thinking-card";
import { MarketPulseBar } from "@/components/ai/market-pulse-bar";
import type { ChatMessage } from "@/components/ai/model";
import { NoticeCard } from "@/components/ai/notices";
import { RichAssistantMessage } from "@/components/ai/rich-message";
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
        "min-h-0 overflow-y-auto overscroll-contain",
        isEmpty
          ? "flex-1 px-4 sm:px-6 lg:flex-none lg:px-0 lg:pb-5"
          : "flex-1 px-4 pt-4 pb-6 sm:px-6 sm:pt-6 sm:pb-8 lg:px-0 lg:pt-7 lg:pb-9",
      )}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {isEmpty ? (
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-1 pt-4 pb-7 text-center sm:pt-6 sm:pb-9 lg:min-h-0 lg:px-0 lg:pt-0 lg:pb-0">
          <div aria-hidden="true" className="relative mb-6 flex items-center justify-center lg:mb-8">
            <span className="absolute -inset-7 rounded-full bg-[radial-gradient(closest-side,#f0f0f0_0%,rgba(255,255,255,0)_76%)]" />
            <span className="absolute inset-[-10px] rounded-[30px] border border-border/40" />
            <span className="relative flex size-16 items-center justify-center rounded-[22px] border border-border/70 bg-white text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] lg:size-20 lg:rounded-[26px]">
              <SparkleIcon />
            </span>
          </div>
          <p className="max-w-[19ch] text-balance text-[30px] leading-[1.08] font-semibold tracking-[-0.03em] text-fg sm:max-w-none sm:text-[36px] lg:max-w-[22ch] lg:text-[40px]">
            {copy.emptyTitle}
          </p>
          <p className="mx-auto mt-3 max-w-[36ch] text-pretty text-[14px] leading-[1.65] text-fg-muted sm:mt-3.5 sm:max-w-md sm:text-[15px]">
            {copy.emptyBody}
          </p>
          <div className="mt-5 w-full text-left sm:mt-6">
            <MarketPulseBar onSelectPrompt={(promptText) => onSuggest?.("tesla", promptText)} />
          </div>
          {onSuggest ? (
            <div className="mt-6 grid w-full grid-cols-1 gap-2.5 text-left sm:mt-7 sm:grid-cols-2 sm:gap-3 lg:hidden">
              {copy.suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSuggest(item.id, item.text)}
                  className="group flex min-h-[68px] items-start gap-3 rounded-2xl border border-border/70 bg-white p-3.5 text-left transition duration-200 ease-[var(--ease-inout)] hover:-translate-y-0.5 hover:border-fg/20 hover:bg-surface-1/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none sm:p-4"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-surface-1 text-fg transition-colors duration-200 group-hover:border-brand group-hover:bg-brand group-hover:text-bg"
                  >
                    <SuggestionBentoIcon id={item.id} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] leading-snug font-semibold text-fg-body transition-colors group-hover:text-fg sm:text-sm">
                      {item.text}
                    </span>
                    <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-fg-muted">
                      <span>Consultar ahora</span>
                      <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none">
                        →
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <ol aria-label={copy.transcript} className="mx-auto flex w-full max-w-2xl flex-col gap-6 sm:gap-7 lg:gap-8">
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
                  <p className="max-w-[88%] rounded-[20px] rounded-br-[7px] bg-fg px-4 py-2.5 text-[14.5px] leading-[1.6] break-words whitespace-pre-wrap text-bg motion-safe:animate-fade-in motion-reduce:animate-none sm:max-w-[78%] sm:px-[18px] sm:py-3 sm:text-[15px]">
                    {message.text}
                  </p>
                ) : (
                  <div className="w-full min-w-0 motion-safe:animate-fade-in motion-reduce:animate-none">
                    <div className="mb-2 flex items-center gap-2 px-0.5" aria-hidden="true">
                      <span className="flex size-6 items-center justify-center rounded-lg border border-border/60 bg-surface-1 text-fg">
                        <MiniSparkleIcon />
                      </span>
                      <span className="text-[10.5px] font-semibold tracking-[0.14em] text-fg-muted uppercase">
                        {copy.assistant}
                      </span>
                    </div>
                    <div className="max-w-[68ch] text-[15px] leading-[1.75] text-fg-body sm:text-[15.5px]">
                      <RichAssistantMessage
                        text={message.text}
                        onFollowUp={(promptText) => onSuggest?.("tesla", promptText)}
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
              {message.widgets && message.widgets.length > 0 ? (
                <div className="mt-4 w-full min-w-0">{renderWidgets(message.widgets)}</div>
              ) : null}
            </li>
          ))}
          {busy ? (
            <li className="min-w-0 motion-safe:animate-pulse motion-reduce:animate-none">
              <GrokThinkingCard label={copy.typing} />
            </li>
          ) : null}
        </ol>
      )}
      <div ref={endRef} className="h-px w-full" aria-hidden="true" />
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-7 lg:size-8" fill="none" aria-hidden="true">
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
      <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" aria-hidden="true">
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
      <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" aria-hidden="true">
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
      <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" aria-hidden="true">
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
    <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" aria-hidden="true">
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

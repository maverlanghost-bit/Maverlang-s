"use client";

import Link from "next/link";
import { useRef, type ChangeEvent, type RefObject } from "react";

import { Composer } from "@/components/ai/composer";
import type { ChatMessage } from "@/components/ai/model";
import { Transcript } from "@/components/ai/transcript";
import { useChatViewport } from "@/components/ai/use-chat-viewport";
import { AiWidgetStack } from "@/components/ai/widget-stack";
import type { AsistenteCopy, AsistenteSuggestionId } from "@/content/i18n/extra-asistente";
import { cn } from "@/lib/cn";

export function ChatView({
  copy,
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
  backLabel,
}: {
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
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useChatViewport(panelRef);
  const isEmpty = messages.length === 0 && !typing;

  // Móvil: el compositor vive en el dock de la barra inferior (padding inferior = --app-tabs-height).
  // El header es local a la pantalla: retorno al mercado solo en móvil/tablet (en lg manda la sidebar).
  // Escritorio: el panel fijo arranca donde termina la barra lateral. `--app-sidebar-width`
  // lo publica el shell (72px colapsada / 220px expandida) y la transición acompaña el
  // morph de la barra. El `!` gana al `left` en px que escribe useChatViewport; en móvil
  // esa clase no aplica y el hook sigue mandando (left 0, alto del visualViewport y dock).
  return (
    <div
      ref={panelRef}
      data-ai-chat
      className="fixed z-20 flex min-h-0 flex-col overflow-hidden bg-bg lg:left-[var(--app-sidebar-width,0px)]! lg:transition-[left] lg:duration-200 lg:ease-spring lg:motion-reduce:transition-none"
      style={{ top: 0, right: 0, left: 0, height: "100dvh" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 55% at 50% -8%, var(--color-surface-1) 0%, rgba(255,255,255,0) 62%)",
        }}
      />

      <div className="relative mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col">
        <header className="relative z-10 shrink-0">
          <div className="mx-auto w-full max-w-2xl px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-2.5 sm:px-6 sm:pb-3 lg:px-0 lg:pt-7 lg:pb-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <Link
                  href="/app"
                  aria-label={backLabel}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border/75 bg-white/85 text-fg-body transition hover:border-fg/25 hover:bg-white hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg active:scale-95 motion-reduce:transition-none lg:hidden"
                >
                  <ArrowLeftIcon />
                </Link>
                <span
                  aria-hidden="true"
                  className="hidden size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-white text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:flex lg:size-11 lg:rounded-[14px]"
                >
                  <AssistantSparkIcon />
                </span>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <h1 className="truncate text-[15px] leading-tight font-semibold tracking-tight text-fg sm:text-base lg:text-[17px]">
                      {copy.pageTitle}
                    </h1>
                    <span className="hidden shrink-0 rounded-full border border-border/70 bg-surface-1/70 px-2 py-0.5 text-[10px] font-medium text-fg-muted sm:inline-flex">
                      xStocks 24/7
                    </span>
                  </div>
                  <p className="mt-0.5 hidden truncate text-xs leading-relaxed text-fg-muted sm:block lg:text-[12.5px]">
                    {copy.lead}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                {messages.length > 0 ? (
                  <button
                    type="button"
                    aria-label={copy.clear}
                    title={copy.clear}
                    onClick={onClear}
                    className="inline-flex size-10 shrink-0 touch-manipulation items-center justify-center rounded-full border border-border/75 bg-white/85 text-fg-body transition hover:border-fg/25 hover:bg-white hover:text-fg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-95 motion-reduce:transition-none lg:hidden"
                  >
                    <ResetSparkleIcon />
                  </button>
                ) : null}
                <span
                  title="Sesión privada guardada sólo en tu navegador"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 bg-white/70 px-2.5 text-xs font-medium text-fg-body sm:px-3"
                >
                  <PrivateShieldIcon />
                  <span className="sr-only sm:not-sr-only">Privado</span>
                </span>
              </div>
            </div>
          </div>

          <div aria-hidden="true" className="mx-auto w-full max-w-2xl px-4 sm:px-6 lg:px-0">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>
        </header>

        <div
          className={cn(
            "relative flex min-h-0 flex-1 flex-col",
            isEmpty && "lg:justify-center lg:pb-12",
          )}
        >
          <Transcript
            copy={copy}
            messages={messages}
            typing={typing}
            announcement={announcement}
            onRetry={onRetry}
            onSuggest={onSuggest}
            renderWidgets={(widgets) => <AiWidgetStack widgets={widgets} copy={copy} />}
          />
          <Composer
            copy={copy}
            draft={draft}
            pendingImage={pendingImage}
            typing={typing}
            photoError={photoError}
            suggestions={isEmpty}
            onDraft={onDraft}
            onSubmit={onSubmit}
            onSuggest={onSuggest}
            onAttach={onAttach}
            onFile={onFile}
            onRemoveImage={onRemoveImage}
            fileRef={fileRef}
          />
        </div>
      </div>
    </div>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M13 8H3m0 0 4-4M3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AssistantSparkIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
      <path
        d="M10 2.75c.38 3.02 1.63 4.27 4.65 4.65-3.02.38-4.27 1.63-4.65 4.65-.38-3.02-1.63-4.27-4.65-4.65 3.02-.38 4.27-1.63 4.65-4.65Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M15 13.1c.2 1.55.84 2.2 2.4 2.4-1.56.2-2.2.84-2.4 2.4-.2-1.56-.84-2.2-2.4-2.4 1.56-.2 2.2-.85 2.4-2.4Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PrivateShieldIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 text-fg-muted" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path
        d="M8 2.25 3.25 4.2v3.55c0 3.05 2.02 5.45 4.75 6.25 2.73-.8 4.75-3.2 4.75-6.25V4.2L8 2.25Z"
        strokeLinejoin="round"
      />
      <path d="m6.2 8.1 1.25 1.25 2.45-2.45" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ResetSparkleIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
      <path
        d="M13.25 8a5.25 5.25 0 1 1-1.45-3.63M13.25 2.75v2.1h-2.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

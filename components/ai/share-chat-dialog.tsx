"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { ChatMessage } from "@/components/ai/model";
import { cn } from "@/lib/cn";

type ShareMode = "pair" | "all";

type ShareChatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatTitle: string;
  messages: readonly ChatMessage[];
  singlePair?: { question: string; answer: string } | null;
};

type PreviewEntry = {
  key: string;
  role: "user" | "assistant";
  text: string;
};

const USER_LABEL = "Tú";
const ASSISTANT_LABEL = "Maverlang IA";
const SHARE_PATH = "/app/asistente";

function speakerLabel(role: "user" | "assistant"): string {
  return role === "user" ? USER_LABEL : ASSISTANT_LABEL;
}

/** Nombre de archivo seguro: sin tildes, espacios ni caracteres reservados. */
function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return slug || "chat";
}

function buildEntries(
  mode: ShareMode,
  messages: readonly ChatMessage[],
  pair: { question: string; answer: string } | null,
): PreviewEntry[] {
  if (mode === "pair" && pair) {
    return [
      { key: "pair-question", role: "user" as const, text: pair.question },
      { key: "pair-answer", role: "assistant" as const, text: pair.answer },
    ].filter((entry) => entry.text.trim().length > 0);
  }
  return messages
    .filter((message) => message.text.trim().length > 0)
    .map((message) => ({ key: message.id, role: message.role, text: message.text }));
}

function buildPlainText(entries: readonly PreviewEntry[]): string {
  return entries
    .map((entry) => `${speakerLabel(entry.role)}:\n${entry.text.trim()}`)
    .join("\n\n");
}

function buildMarkdown(title: string, entries: readonly PreviewEntry[]): string {
  const heading = title.trim() ? `# ${title.trim()}` : "# Conversación de Maverlang";
  const sections = entries.map(
    (entry) => `### ${speakerLabel(entry.role)}\n\n${entry.text.trim()}`,
  );
  return `${[heading, ...sections].join("\n\n")}\n`;
}

type IconProps = { className?: string };

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: "false",
} as const;

function CloseIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={cn("size-4", className)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function CopyIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={cn("size-4", className)}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={cn("size-4", className)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function DownloadIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={cn("size-4", className)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function LinkIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={cn("size-4", className)}>
      <path d="M9 17H7a5 5 0 0 1 0-10h2" />
      <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
      <path d="M8 12h8" />
    </svg>
  );
}

export function ShareChatDialog({
  open,
  onOpenChange,
  chatTitle,
  messages,
  singlePair,
}: ShareChatDialogProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const previewId = `${baseId}-preview`;
  const timerRef = useRef<number | null>(null);
  const [mode, setMode] = useState<ShareMode | null>(null);
  const [copied, setCopied] = useState<"text" | "link" | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  // Al cerrar, se limpia el estado para que la próxima apertura parta limpia.
  useEffect(() => {
    if (!open) return;
    return () => {
      setMode(null);
      setCopied(null);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open]);

  const pair = singlePair ?? null;
  const activeMode: ShareMode = pair ? (mode ?? "pair") : "all";
  const entries = buildEntries(activeMode, messages, pair);

  function flashCopied(kind: "text" | "link") {
    setCopied(kind);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setCopied(null);
      timerRef.current = null;
    }, 2000);
  }

  async function copyToClipboard(value: string): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.clipboard) return false;
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  async function handleCopyText() {
    if (await copyToClipboard(buildPlainText(entries))) flashCopied("text");
  }

  async function handleCopyLink() {
    if (typeof window === "undefined") return;
    const link = `${window.location.origin}${SHARE_PATH}`;
    if (await copyToClipboard(link)) flashCopied("link");
  }

  function handleDownload() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const markdown = buildMarkdown(chatTitle, entries);
    try {
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slugify(chatTitle)}-maverlang.md`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Descarga bloqueada por el navegador: no hay nada más que hacer.
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-fg/35 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-t-3xl border border-border bg-white p-5 shadow-float sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-fg">
              Compartir conversación
            </h2>
            <p className="mt-0.5 truncate text-xs text-fg-muted">{chatTitle}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Cerrar"
            title="Cerrar"
            className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-muted transition hover:bg-surface-1 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            <CloseIcon />
          </button>
        </div>

        {pair ? (
          <div
            role="tablist"
            aria-label="Qué quieres compartir"
            className="mt-4 grid grid-cols-2 gap-1 rounded-full border border-border/70 bg-surface-1 p-1"
          >
            <button
              type="button"
              role="tab"
              id={`${baseId}-tab-pair`}
              aria-selected={activeMode === "pair"}
              aria-controls={previewId}
              onClick={() => setMode("pair")}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition focus-visible:ring-4 focus-visible:ring-fg/20",
                activeMode === "pair" ? "bg-white text-fg shadow-sm" : "text-fg-muted hover:text-fg",
              )}
            >
              Esta respuesta
            </button>
            <button
              type="button"
              role="tab"
              id={`${baseId}-tab-all`}
              aria-selected={activeMode === "all"}
              aria-controls={previewId}
              onClick={() => setMode("all")}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition focus-visible:ring-4 focus-visible:ring-fg/20",
                activeMode === "all" ? "bg-white text-fg shadow-sm" : "text-fg-muted hover:text-fg",
              )}
            >
              Todo el chat ({messages.length})
            </button>
          </div>
        ) : null}

        <div
          id={previewId}
          role={pair ? "tabpanel" : undefined}
          aria-labelledby={pair ? `${baseId}-tab-${activeMode}` : undefined}
          className="mt-4 max-h-64 space-y-3 overflow-y-auto rounded-2xl border border-border/70 bg-surface-1/60 p-3"
        >
          {entries.length === 0 ? (
            <p className="py-6 text-center text-xs text-fg-muted">Sin contenido para compartir.</p>
          ) : (
            entries.map((entry) => (
              <div key={entry.key} className="flex items-start gap-2">
                <span
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    entry.role === "user" ? "bg-surface-3 text-fg-body" : "bg-brand text-bg",
                  )}
                >
                  {entry.role === "user" ? "Tú" : "M"}
                </span>
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-fg-body">
                  {entry.text}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCopyText}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-fg px-3.5 py-2 text-xs font-semibold text-bg transition hover:opacity-90 focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            {copied === "text" ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
            {copied === "text" ? "¡Texto copiado!" : "Copiar texto"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-white px-3.5 py-2 text-xs font-semibold text-fg-body transition hover:bg-surface-1 focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            <DownloadIcon className="size-3.5" />
            Descargar .md
          </button>
        </div>

        <button
          type="button"
          onClick={handleCopyLink}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-border bg-white px-3.5 py-2 text-xs font-semibold text-fg-body transition hover:bg-surface-1 focus-visible:ring-4 focus-visible:ring-fg/20"
        >
          {copied === "link" ? <CheckIcon className="size-3.5" /> : <LinkIcon className="size-3.5" />}
          {copied === "link" ? "¡Enlace copiado!" : "Copiar enlace"}
        </button>
      </div>
    </div>
  );
}

export default ShareChatDialog;

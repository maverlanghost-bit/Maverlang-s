"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

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

type ShareDialogCardProps = {
  chatTitle: string;
  messages: readonly ChatMessage[];
  singlePair: { question: string; answer: string } | null;
  onClose: () => void;
};

type PreviewEntry = {
  key: string;
  role: "user" | "assistant";
  text: string;
};

const USER_LABEL = "Tú";
const ASSISTANT_LABEL = "Maverlang AI";

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
  const body = entries
    .map((entry) => `${speakerLabel(entry.role)}:\n${entry.text.trim()}`)
    .join("\n\n———\n\n");
  return `${body}\n\n— Generado con Maverlang AI · Solo lectura`;
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

function MessageSquareIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={cn("size-4", className)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function MessagesSquareIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={cn("size-4", className)}>
      <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" />
      <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
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

function ShareDialogCard({ chatTitle, messages, singlePair, onClose }: ShareDialogCardProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const previewId = `${baseId}-preview`;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [mode, setMode] = useState<ShareMode>(singlePair ? "pair" : "all");
  const [copied, setCopied] = useState(false);

  const pair = singlePair ?? null;
  const activeMode: ShareMode = pair ? mode : "all";
  const entries = useMemo(
    () => buildEntries(activeMode, messages, pair),
    [activeMode, messages, pair],
  );

  // Foco inicial en el panel; al desmontarse, vuelve al elemento que abrió el diálogo.
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

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
    if (!(await copyToClipboard(buildPlainText(entries)))) return;
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, 2000);
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

  return (
    <motion.div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 8 }}
      transition={{ type: "spring", damping: 30, stiffness: 360 }}
      onClick={(event) => event.stopPropagation()}
      className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xl outline-none"
    >
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200/70 px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate font-semibold text-zinc-900">
            Compartir conversación
          </h2>
          <p className="mt-0.5 truncate text-xs text-zinc-500">{chatTitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          title="Cerrar"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="px-5 py-4">
        <div
          role="tablist"
          aria-label="Qué quieres compartir"
          className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1"
        >
          <button
            type="button"
            role="tab"
            id={`${baseId}-tab-pair`}
            aria-selected={activeMode === "pair"}
            aria-controls={previewId}
            disabled={!pair}
            onClick={() => setMode("pair")}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20",
              activeMode === "pair"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-800",
              !pair && "cursor-not-allowed opacity-40 hover:text-zinc-500",
            )}
          >
            <MessageSquareIcon className="size-3.5" />
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
              "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20",
              activeMode === "all"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-800",
            )}
          >
            <MessagesSquareIcon className="size-3.5" />
            Todo el chat ({messages.length})
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50/70">
          <div
            id={previewId}
            role={pair ? "tabpanel" : undefined}
            aria-labelledby={pair ? `${baseId}-tab-${activeMode}` : undefined}
            className="max-h-64 space-y-3 overflow-y-auto px-4 py-4"
          >
            {entries.length === 0 ? (
              <p className="py-8 text-center text-xs text-zinc-400">
                Sin contenido para compartir.
              </p>
            ) : (
              entries.map((entry) =>
                entry.role === "user" ? (
                  <div key={entry.key} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-zinc-100 px-4 py-2.5 text-sm leading-relaxed text-zinc-900">
                      {entry.text}
                    </p>
                  </div>
                ) : (
                  <div key={entry.key} className="flex justify-start">
                    <p className="max-w-[92%] whitespace-pre-wrap break-words px-1 text-sm leading-relaxed text-zinc-700">
                      {entry.text}
                    </p>
                  </div>
                ),
              )
            )}
          </div>
          <div className="border-t border-zinc-200/70 px-4 py-2 text-[11px] text-zinc-400">
            Maverlang AI · Solo lectura
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCopyText}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copiado" : "Copiar texto"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20"
          >
            <DownloadIcon />
            Descargar .md
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function ShareChatDialog({
  open,
  onOpenChange,
  chatTitle,
  messages,
  singlePair,
}: ShareChatDialogProps) {
  const closeDialog = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeDialog]);

  // Bloquea el scroll de la página mientras el diálogo está abierto.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="share-chat"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={closeDialog}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        >
          <ShareDialogCard
            chatTitle={chatTitle}
            messages={messages}
            singlePair={singlePair ?? null}
            onClose={closeDialog}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default ShareChatDialog;

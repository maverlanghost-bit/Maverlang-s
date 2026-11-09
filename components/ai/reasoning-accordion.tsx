"use client";

import { useId, useState, type ReactElement } from "react";

import { cn } from "@/lib/cn";

/**
 * Separa el razonamiento del texto visible de una respuesta: extrae todo lo
 * que va entre las etiquetas de pensamiento (apertura `think`, cierre
 * `/think`) y, si el bloque queda abierto, lo trata como streaming.
 */
export function extractThinkingSegments(rawContent: string): {
  reasoning: string | null;
  cleanContent: string;
  isThinkingOpen: boolean;
} {
  const source = typeof rawContent === "string" ? rawContent : "";
  const outside: string[] = [];
  const blocks: string[] = [];
  const tagPattern = /<\/?think>/gi;
  let current: string[] = [];
  let cursor = 0;
  let isThinkingOpen = false;
  let sawTag = false;

  for (let match = tagPattern.exec(source); match !== null; match = tagPattern.exec(source)) {
    const tag = match[0];
    const before = source.slice(cursor, match.index);
    sawTag = true;

    if (isThinkingOpen) {
      current.push(before);
    } else {
      outside.push(before);
    }

    cursor = match.index + tag.length;

    if (tag.startsWith("</")) {
      if (isThinkingOpen) {
        blocks.push(current.join(""));
        current = [];
        isThinkingOpen = false;
      }
      // Un cierre huérfano no aporta contenido: se descarta.
      continue;
    }

    if (isThinkingOpen) {
      // Apertura anidada: es ruido de marcado, no se muestra en el panel.
      continue;
    }

    isThinkingOpen = true;
    current = [];
  }

  const tail = source.slice(cursor);
  if (isThinkingOpen) {
    current.push(tail);
    if (current.join("").trim().length > 0) blocks.push(current.join(""));
  } else {
    outside.push(tail);
  }

  const reasoning = blocks
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .join("\n\n");

  return {
    reasoning: reasoning.length > 0 ? reasoning : null,
    // Sin etiquetas el contenido se devuelve intacto; con etiquetas se
    // colapsan los huecos que dejan los bloques eliminados.
    cleanContent: sawTag ? outside.join("").replace(/\s+/g, " ").trim() : source,
    isThinkingOpen,
  };
}

function BrainIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn(
        "size-3.5 shrink-0",
        active && "text-brand motion-safe:animate-pulse motion-reduce:animate-none",
      )}
    >
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn(
        "size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
        open ? "rotate-180" : "rotate-0",
      )}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Acordeón compacto con el razonamiento del asistente. Colapsado muestra un
 * disparador de una línea; abierto, el texto en un panel con borde de marca.
 * Devuelve `null` si no hay razonamiento y la respuesta ya terminó.
 */
export function ReasoningAccordion({
  reasoning,
  isStreaming = false,
  durationSeconds,
  defaultOpen = false,
  className,
}: {
  reasoning?: string | null;
  isStreaming?: boolean;
  durationSeconds?: number;
  defaultOpen?: boolean;
  className?: string;
}): ReactElement | null {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = useId();
  const body = reasoning?.trim() ?? "";

  if (!body && !isStreaming) return null;

  const hasDuration =
    typeof durationSeconds === "number" &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0;
  const seconds = hasDuration ? Math.max(1, Math.round(durationSeconds)) : 0;
  const label = isStreaming
    ? "Pensando..."
    : hasDuration
      ? `Pensó por ${seconds}s`
      : "Razonamiento";

  return (
    <div
      className={cn("not-prose my-1.5 min-w-0", className)}
      data-ai-reasoning={isStreaming ? "streaming" : "done"}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-fg-muted",
          "transition-colors outline-none motion-reduce:transition-none",
          "hover:bg-surface-1 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20",
        )}
      >
        <BrainIcon active={isStreaming} />
        {isStreaming ? (
          <span className="bg-gradient-to-r from-fg-muted via-fg to-fg-muted bg-clip-text text-transparent motion-safe:animate-pulse motion-reduce:animate-none">
            Pensando...
          </span>
        ) : (
          <span className="tabular-nums">{label}</span>
        )}
        <ChevronIcon open={isOpen} />
      </button>

      <div
        id={panelId}
        hidden={!isOpen}
        className={cn(
          "mt-1.5 border-l-2 border-brand/30 py-1 pl-3.5 text-xs leading-relaxed text-fg-muted whitespace-pre-wrap",
        )}
      >
        {body}
        {isStreaming ? (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-3 w-[2px] translate-y-[1px] bg-fg-muted/70 align-middle motion-safe:animate-pulse motion-reduce:animate-none"
          />
        ) : null}
      </div>
    </div>
  );
}

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

/** Cerebro de lucide, dibujado localmente para no depender de iconos externos. */
function BrainIcon({ streaming }: { streaming: boolean }) {
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
      className={
        streaming
          ? "size-3.5 shrink-0 animate-pulse text-[#1890FF]"
          : "size-3.5 shrink-0"
      }
    >
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
    </svg>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
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
        "size-3.5 text-zinc-400 transition-transform duration-200 shrink-0",
        open ? "rotate-180" : "rotate-0",
      )}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Acordeón compacto con el razonamiento del asistente. Se abre solo mientras
 * la respuesta se está generando y se pliega al terminar; el usuario puede
 * abrirlo o cerrarlo cuando quiera. Devuelve `null` sin razonamiento.
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
  // `null` = el usuario aún no decidió: se usa el valor derivado de las props
  // (abierto mientras llega el stream, plegado al terminar), sin efectos.
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const panelId = useId().replace(/:/g, "");

  const body = typeof reasoning === "string" ? reasoning.trim() : "";
  if (body.length === 0 && !isStreaming) return null;

  const hasDuration =
    typeof durationSeconds === "number" &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0;
  const seconds = hasDuration ? Math.max(1, Math.round(durationSeconds)) : 0;
  const expanded = openOverride ?? (defaultOpen || isStreaming);

  return (
    <div
      className={cn("not-prose w-full min-w-0", className)}
      data-ai-reasoning={isStreaming ? "streaming" : "done"}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setOpenOverride(!expanded)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 select-none cursor-pointer py-1 transition-colors"
      >
        <BrainIcon streaming={isStreaming} />
        {isStreaming ? (
          <span className="animate-pulse">Pensando...</span>
        ) : hasDuration ? (
          <span className="tabular-nums">Pensó por {seconds}s</span>
        ) : (
          <span>Razonamiento</span>
        )}
        <ChevronDownIcon open={expanded} />
      </button>

      <div
        id={panelId}
        hidden={!expanded}
        className="mt-1.5 pl-3 border-l-2 border-zinc-200 text-[12.5px] leading-relaxed max-h-56 overflow-y-auto scrollbar-thin whitespace-pre-wrap text-zinc-600"
      >
        {body}
        {isStreaming ? (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-3 w-1 translate-y-px bg-zinc-400 align-middle animate-pulse"
          />
        ) : null}
      </div>
    </div>
  );
}

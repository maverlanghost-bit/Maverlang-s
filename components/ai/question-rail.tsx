"use client";

import { useEffect, useId, useMemo, useState } from "react";

import type { ChatMessage } from "@/components/ai/model";
import { cn } from "@/lib/cn";

const DEFAULT_CONTAINER_SELECTOR = "[data-ai-scroll]";
const MAX_DOTS = 30;
const DOT_TARGET_HEIGHT = 24;
/** Altura bajo el borde del contenedor donde un mensaje ya se considera leído. */
const ACTIVE_TOP_OFFSET = 96;
/** Separador que no puede aparecer en un id de mensaje. */
const ID_SEPARATOR = "\u0000";

export type QuestionEntry = {
  id: string;
  question: string;
  answer: string;
  messageIndex: number;
};

/** Una entrada por pregunta del usuario, con la primera respuesta posterior. */
export function getQuestionEntries(messages: readonly ChatMessage[]): QuestionEntry[] {
  const entries: QuestionEntry[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message || message.role !== "user") continue;
    const question = message.text.trim();
    if (!question) continue;

    let answer = "";
    for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex += 1) {
      const candidate = messages[nextIndex];
      if (!candidate) continue;
      if (candidate.role === "user") break;
      if (candidate.notice) continue;
      const text = candidate.text.trim();
      if (text) {
        answer = text;
        break;
      }
    }

    entries.push({ id: message.id, question, answer, messageIndex: index });
  }

  return entries;
}

/**
 * Ventana contigua de índices para no desbordar el riel. Si caben todos,
 * devuelve el rango completo; si no, una ventana de `max` centrada en el
 * activo y siempre dentro de rango.
 */
export function visibleDotWindow(total: number, activeIndex: number, max = 30): number[] {
  const count = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  if (count === 0) return [];

  const limit = Number.isFinite(max) ? Math.max(1, Math.floor(max)) : MAX_DOTS;
  if (count <= limit) {
    return Array.from({ length: count }, (_, index) => index);
  }

  const size = limit;
  const active = Number.isFinite(activeIndex)
    ? Math.min(Math.max(0, Math.floor(activeIndex)), count - 1)
    : 0;
  const start = Math.min(Math.max(0, active - Math.floor(size / 2)), count - size);

  return Array.from({ length: size }, (_, offset) => start + offset);
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function findContainer(selector: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  try {
    const node = document.querySelector(selector);
    return node instanceof HTMLElement ? node : null;
  } catch {
    return null;
  }
}

function findMessageNode(container: HTMLElement, id: string): HTMLElement | null {
  const nodes = container.querySelectorAll<HTMLElement>("[data-user-msg-id]");
  for (const node of nodes) {
    if (node.getAttribute("data-user-msg-id") === id) return node;
  }
  return null;
}

function clipPreview(text: string, limit: number): string {
  const flat = text
    .replace(/^[ \t]*(?:#{1,6}|[-*•])[ \t]+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1).trimEnd()}…`;
}

type QuestionRailProps = {
  messages: readonly ChatMessage[];
  containerSelector?: string;
};

/**
 * Riel vertical de puntos en el borde izquierdo del chat. Cada punto lleva a
 * una pregunta del usuario y muestra su respuesta al pasar el cursor o al
 * enfocar con el teclado. Sólo existe con dos o más preguntas.
 */
export function QuestionRail({
  messages,
  containerSelector = DEFAULT_CONTAINER_SELECTOR,
}: QuestionRailProps) {
  const entries = useMemo(() => getQuestionEntries(messages), [messages]);
  const idsKey = useMemo(() => entries.map((entry) => entry.id).join(ID_SEPARATOR), [entries]);

  const [rawActiveIndex, setActiveIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(14);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const tooltipId = useId();

  useEffect(() => {
    const container = findContainer(containerSelector);
    if (!container) return;

    const ids = idsKey.length === 0 ? [] : idsKey.split(ID_SEPARATOR);
    if (ids.length < 2) return;

    const measure = () => {
      const threshold = container.getBoundingClientRect().top + ACTIVE_TOP_OFFSET;
      const nodes = container.querySelectorAll<HTMLElement>("[data-user-msg-id]");
      const byId = new Map<string, HTMLElement>();
      for (const node of nodes) {
        const id = node.getAttribute("data-user-msg-id");
        if (id && !byId.has(id)) byId.set(id, node);
      }

      let next = -1;
      let lastFound = -1;
      ids.forEach((id, index) => {
        const node = byId.get(id);
        if (!node) return;
        lastFound = index;
        if (node.getBoundingClientRect().top <= threshold) next = index;
      });

      if (lastFound < 0) return;
      const atBottom = container.scrollTop > 0 && container.scrollHeight - container.clientHeight - container.scrollTop <= 1;
      const resolved = atBottom ? lastFound : Math.max(next, 0);
      setActiveIndex((previous) => (previous === resolved ? previous : resolved));
    };

    const resize = () => {
      const capacity = Math.floor((container.clientHeight - 64) / DOT_TARGET_HEIGHT) - 2;
      setVisibleCount(Math.max(3, Math.min(MAX_DOTS, capacity)));
      measure();
    };
    const frame = window.requestAnimationFrame(resize);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(container);
    container.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(frame);
      container.removeEventListener("scroll", measure);
      window.removeEventListener("resize", resize);
      observer?.disconnect();
    };
  }, [containerSelector, idsKey]);

  if (entries.length < 2) return null;

  const total = entries.length;
  const activeIndex = Math.min(Math.max(0, rawActiveIndex), total - 1);
  const windowIndices = visibleDotWindow(total, activeIndex, visibleCount);
  const firstVisible = windowIndices[0] ?? 0;
  const lastVisible = windowIndices[windowIndices.length - 1] ?? 0;
  const previewIndex = entries.findIndex((entry) => entry.id === previewId);
  const preview = windowIndices.includes(previewIndex) ? entries[previewIndex] : undefined;
  const answer = preview ? clipPreview(preview.answer, 230) : "";

  function goToEntry(index: number, id: string) {
    const container = findContainer(containerSelector);
    if (!container) return;
    const node = findMessageNode(container, id);
    if (!node) return;

    setActiveIndex(index);
    const delta =
      node.getBoundingClientRect().top - container.getBoundingClientRect().top - ACTIVE_TOP_OFFSET;
    const top = Math.max(0, container.scrollTop + delta);
    container.scrollTo({
      top,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  return (
    <nav
      aria-label="Navegar por tus preguntas"
      className="absolute top-1/2 left-0 z-20 hidden -translate-y-1/2 flex-col items-center md:flex"
    >
      {firstVisible > 0 ? (
        <span aria-hidden="true" className="grid h-5 place-items-center text-xs text-fg-muted">
          ···
        </span>
      ) : null}

      {windowIndices.map((index) => {
        const entry = entries[index];
        if (!entry) return null;

        const isActive = index === activeIndex;
        return (
          <button
            key={entry.id}
            type="button"
            aria-label={`Pregunta ${index + 1}: ${clipPreview(entry.question, 60)}`}
            aria-current={isActive ? "location" : undefined}
            aria-describedby={preview?.id === entry.id ? tooltipId : undefined}
            onClick={() => goToEntry(index, entry.id)}
            onPointerEnter={(event) => {
              if (event.pointerType !== "touch") setPreviewId(entry.id);
            }}
            onPointerLeave={(event) => {
              if (!event.currentTarget.matches(":focus-visible")) {
                setPreviewId((current) => current === entry.id ? null : current);
              }
            }}
            onFocus={() => setPreviewId(entry.id)}
            onBlur={() => setPreviewId((current) => current === entry.id ? null : current)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setPreviewId(null);
            }}
            className="group/dot grid size-6 cursor-pointer place-items-center rounded-full hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fg"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full bg-fg-muted/60 transition-[background-color,transform] group-hover/dot:scale-125 group-hover/dot:bg-fg motion-reduce:transition-none",
                isActive && "size-2.5 bg-fg",
              )}
            />

          </button>
        );
      })}

      {lastVisible < total - 1 ? (
        <span aria-hidden="true" className="grid h-5 place-items-center text-xs text-fg-muted">
          ···
        </span>
      ) : null}

      {preview ? (
        <div
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute top-1/2 left-full ml-2 w-80 -translate-y-1/2 rounded-2xl border border-border bg-bg px-4 py-3.5 text-left shadow-float"
        >
          <p className="line-clamp-2 text-[15px] leading-snug font-semibold text-fg [overflow-wrap:anywhere]">
            {clipPreview(preview.question, 145)}
          </p>
          {answer ? (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-fg-muted [overflow-wrap:anywhere]">{answer}</p>
          ) : null}
          <p className="mt-2 text-xs tabular-nums text-fg-muted">{previewIndex + 1} de {total}</p>
        </div>
      ) : null}
    </nav>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

import type { ChatMessage } from "@/components/ai/model";
import { cn } from "@/lib/cn";

const DEFAULT_CONTAINER_SELECTOR = "[data-ai-scroll]";
const MAX_DOTS = 30;
/** Altura bajo el borde del contenedor donde un mensaje ya se considera leído. */
const ACTIVE_TOP_OFFSET = 96;
const PREVIEW_LIMIT = 60;
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

function clipPreview(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= PREVIEW_LIMIT) return flat;
  return `${flat.slice(0, PREVIEW_LIMIT - 1).trimEnd()}…`;
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
  const [openIndex, setOpenIndex] = useState<number | null>(null);

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
      let found = 0;
      ids.forEach((id, index) => {
        const node = byId.get(id);
        if (!node) return;
        found += 1;
        if (node.getBoundingClientRect().top <= threshold) next = index;
      });

      if (found === 0) return;
      const resolved = next < 0 ? 0 : next;
      setActiveIndex((previous) => (previous === resolved ? previous : resolved));
    };

    const frame = window.requestAnimationFrame(measure);
    container.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(frame);
      container.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [containerSelector, idsKey]);

  if (entries.length < 2) return null;

  const total = entries.length;
  const activeIndex = Math.min(Math.max(0, rawActiveIndex), total - 1);
  const windowIndices = visibleDotWindow(total, activeIndex, MAX_DOTS);
  const firstVisible = windowIndices[0] ?? 0;
  const lastVisible = windowIndices[windowIndices.length - 1] ?? 0;

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
      className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-2 md:flex"
    >
      {firstVisible > 0 ? (
        <span aria-hidden="true" className="text-[10px] leading-none text-zinc-400">
          ···
        </span>
      ) : null}

      {windowIndices.map((index) => {
        const entry = entries[index];
        if (!entry) return null;

        const isActive = index === activeIndex;
        const isOpen = openIndex === index;
        const label = clipPreview(entry.question);
        const tipId = `question-rail-tip-${index}`;

        return (
          <div
            key={entry.id}
            className="relative flex h-2 w-2 items-center justify-center"
            onMouseEnter={() => setOpenIndex(index)}
            onMouseLeave={() => setOpenIndex((previous) => (previous === index ? null : previous))}
            onFocus={() => setOpenIndex(index)}
            onBlur={() => setOpenIndex((previous) => (previous === index ? null : previous))}
          >
            <button
              type="button"
              aria-label={`Pregunta ${index + 1}: ${label}`}
              aria-current={isActive ? "true" : undefined}
              aria-describedby={isOpen ? tipId : undefined}
              onClick={() => goToEntry(index, entry.id)}
              className={cn(
                "size-1.5 cursor-pointer rounded-full bg-zinc-300 transition-colors",
                "hover:bg-zinc-500 focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-zinc-900/30 focus-visible:ring-offset-2",
                "motion-reduce:transition-none",
                isActive && "size-2 bg-zinc-900 hover:bg-zinc-900",
              )}
            />

            {isOpen ? (
              <div
                id={tipId}
                role="tooltip"
                className="absolute left-full top-1/2 z-30 -translate-y-1/2 pl-3"
              >
                <div className="w-72 rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-lg">
                  <p className="truncate text-sm font-semibold leading-snug text-zinc-900">
                    {entry.question}
                  </p>
                  {entry.answer ? (
                    <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-zinc-500">
                      {entry.answer}
                    </p>
                  ) : null}
                  <p className="mt-2.5 text-[11px] font-medium tabular-nums text-zinc-400">
                    {index + 1} de {total}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {lastVisible < total - 1 ? (
        <span aria-hidden="true" className="text-[10px] leading-none text-zinc-400">
          ···
        </span>
      ) : null}
    </nav>
  );
}

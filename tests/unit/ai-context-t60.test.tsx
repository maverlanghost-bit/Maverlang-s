/**
 * T60 — contexto adjunto, riel de preguntas y cluster superior del asistente.
 *
 * El environment de vitest es "node": no hay DOM. Todo se renderiza con
 * `renderToStaticMarkup` y se usan `createElement` (nunca JSX). Los componentes
 * que dependen de react-query (el selector de contexto) se mockean para probar
 * el SSR sin `QueryClientProvider` y sin red. Determinista: sin fetch, sin
 * timers y sin fechas.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// `next/link` necesita el router de la app; en SSR de test se reemplaza por un
// ancla plana.
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ href, children, ...props }: { href: string; children?: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

// `next/image` sin loader de Next: una etiqueta <img> simple.
vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: (props: { src?: string; alt?: string; className?: string }) =>
      React.createElement("img", { src: props.src, alt: props.alt, className: props.className }),
  };
});

// `useT` real depende de react-query y de la sesión; el caso por defecto del
// producto es es-CL/CLP.
vi.mock("@/lib/hooks/use-t", async () => {
  const { esCL } = await import("@/content/i18n/es-CL");
  return {
    useT: () => ({ t: esCL, language: "es-CL" as const, currency: "CLP" as const }),
  };
});

// El selector de contexto lee datos con hooks de react-query. Se reemplazan por
// respuestas vacías y estables: el test sólo renderiza el modal cerrado (SSR) y
// ningún hook debe exigir un `QueryClientProvider` ni tocar la red.
vi.mock("@/lib/hooks/queries", () => ({
  usePortfolio: () => ({ data: undefined, isLoading: false, isPending: false, error: null }),
  useTickers: () => ({ data: [], isLoading: false, isPending: false, error: null }),
  useMarketSearch: () => ({ data: [], isLoading: false, isPending: false, error: null }),
  usePrices: () => ({ data: {}, isLoading: false, isPending: false, error: null }),
  usePrefs: () => ({ data: null, isLoading: false, isPending: false, error: null }),
  useMe: () => ({ data: null, isLoading: false, isPending: false, error: null }),
  useBalances: () => ({ data: null, isLoading: false, isPending: false, error: null }),
  useActivity: () => ({ data: null, isLoading: false, isPending: false, error: null }),
  useFx: () => ({ data: null, isLoading: false, isPending: false, error: null }),
  useMarketStatus: () => ({ data: null, isLoading: false, isPending: false, error: null }),
}));

import { AssistantNavbar } from "@/components/ai/assistant-navbar";
import * as contextPickerModule from "@/components/ai/context-picker";
import {
  MAX_CONTEXT_ITEMS,
  PORTFOLIO_ITEM,
  buildContextDirective,
  toggleContextItem,
  type ContextItem,
} from "@/components/ai/context-types";
import type { ChatMessage } from "@/components/ai/model";
import { QuestionRail, getQuestionEntries, visibleDotWindow } from "@/components/ai/question-rail";

/** El picker puede exportarse con nombre o por defecto; se aceptan ambos. */
type ContextPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: readonly ContextItem[];
  onToggle: (item: ContextItem) => void;
};
type ContextPickerComponent = (props: ContextPickerProps) => ReactElement | null;
const pickerExports = contextPickerModule as unknown as {
  ContextPicker?: ContextPickerComponent;
  default?: ContextPickerComponent;
};
const ContextPicker = pickerExports.ContextPicker ?? pickerExports.default;

function html(node: ReactElement | null): string {
  return node ? renderToStaticMarkup(node) : "";
}

function message(id: string, role: "user" | "assistant", text: string): ChatMessage {
  return { id, role, text };
}

const STOCK_ITEM: ContextItem = { id: "stock:NVDAx", kind: "stock", symbol: "NVDAx", name: "NVIDIA" };
const INDEX_ITEM: ContextItem = { id: "index:SPYx", kind: "index", symbol: "SPYx", name: "S&P 500" };

const SNAPSHOT = {
  totalUsd: 1_234.56,
  positions: [{ symbol: "NVDAx", name: "NVIDIA", valueUsd: 500.25, weightPct: 40.5 }],
  prices: { NVDAx: 123.45, SPYx: 610.2 },
};

describe("T60 — contexto del asistente", () => {
  it("toggleContextItem agrega, quita y respeta el tope de 6 sin mutar la lista", () => {
    expect(MAX_CONTEXT_ITEMS).toBe(6);

    const original: ContextItem[] = [STOCK_ITEM, INDEX_ITEM];
    const copy = original.map((item) => ({ ...item }));

    const added = toggleContextItem(original, PORTFOLIO_ITEM);
    expect(added).not.toBe(original);
    expect(added).toHaveLength(3);
    expect(added.some((item) => item.id === PORTFOLIO_ITEM.id)).toBe(true);
    // La lista original quedó intacta.
    expect(original).toEqual(copy);
    expect(original).toHaveLength(2);

    // Congelada: cualquier mutación lanzaría en modo estricto.
    const frozen = Object.freeze([STOCK_ITEM]) as unknown as ContextItem[];
    expect(toggleContextItem(frozen, INDEX_ITEM)).toHaveLength(2);
    expect(frozen).toHaveLength(1);

    const removed = toggleContextItem(added, PORTFOLIO_ITEM);
    expect(removed).toHaveLength(2);
    expect(removed.some((item) => item.id === PORTFOLIO_ITEM.id)).toBe(false);
    expect(added).toHaveLength(3);

    // Ya hay 6: el séptimo no entra y el tope se mantiene.
    const six: ContextItem[] = Array.from(
      { length: MAX_CONTEXT_ITEMS },
      (_, index): ContextItem => ({
        id: `stock:${index}`,
        kind: "stock",
        symbol: `T${index}x`,
        name: `Acción ${index}`,
      }),
    );
    const seventh: ContextItem = { id: "index:QQQx", kind: "index", symbol: "QQQx", name: "Nasdaq 100" };
    const full = toggleContextItem(six, seventh);
    expect(full).toHaveLength(MAX_CONTEXT_ITEMS);
    expect(full.some((item) => item.id === seventh.id)).toBe(false);
    expect(six).toHaveLength(MAX_CONTEXT_ITEMS);
  });

  it("buildContextDirective describe sólo lo adjuntado y nunca imprime cifras inválidas", () => {
    expect(buildContextDirective([], SNAPSHOT)).toBe("");

    const directive = buildContextDirective([STOCK_ITEM, INDEX_ITEM, PORTFOLIO_ITEM], SNAPSHOT);
    expect(typeof directive).toBe("string");
    expect(directive.trim().length).toBeGreaterThan(0);
    expect(directive).not.toContain("\n");

    const lower = directive.toLowerCase();
    for (const fragment of ["contexto del usuario", "acciones:", "índices:", "cartera:", "posiciones"]) {
      expect(lower).toContain(fragment);
    }

    // Cifras null/NaN/Infinity: se omiten, no se imprimen como texto.
    const dirty = buildContextDirective([STOCK_ITEM, INDEX_ITEM, PORTFOLIO_ITEM], {
      totalUsd: Number.NaN,
      positions: [
        { symbol: "NVDAx", name: "NVIDIA", valueUsd: Number.POSITIVE_INFINITY, weightPct: Number.NaN },
        { symbol: "SPYx", name: "S&P 500", valueUsd: null, weightPct: null },
      ],
      prices: { NVDAx: Number.NEGATIVE_INFINITY, SPYx: null },
    });
    expect(dirty.toLowerCase()).toContain("contexto del usuario");
    expect(dirty).not.toMatch(/NaN|undefined|null|Infinity/);

    // Cartera sin ninguna cifra real: no se inventa nada ni se imprime el hueco.
    const sinCifras = buildContextDirective([PORTFOLIO_ITEM], {
      totalUsd: null,
      positions: [],
      prices: {},
    });
    expect(typeof sinCifras).toBe("string");
    expect(sinCifras).not.toMatch(/NaN|undefined|null|Infinity/);
  });

  it("getQuestionEntries arma una entrada por pregunta con su respuesta posterior", () => {
    expect(getQuestionEntries([])).toEqual([]);

    const one = getQuestionEntries([message("u1", "user", "¿Cómo va NVDAx?")]);
    expect(one).toHaveLength(1);
    expect(one[0]?.question).toBe("¿Cómo va NVDAx?");
    // Sin assistant después de la pregunta, la respuesta queda vacía.
    expect(one[0]?.answer).toBe("");

    const two = getQuestionEntries([
      message("u1", "user", "¿Cómo va NVDAx?"),
      message("a1", "assistant", "NVDAx sube 2 % hoy."),
      message("u2", "user", "¿Y Tesla?"),
    ]);
    expect(two.map((entry) => entry.id)).toEqual(["u1", "u2"]);
    expect(two[0]?.answer).toBe("NVDAx sube 2 % hoy.");
    expect(two[1]?.answer).toBe("");

    const three = getQuestionEntries([
      message("u1", "user", "Pregunta uno"),
      message("a1", "assistant", "Respuesta uno"),
      message("u2", "user", "Pregunta dos"),
      message("a2", "assistant", "Respuesta dos"),
      message("u3", "user", "Pregunta tres"),
      message("a3", "assistant", "Respuesta tres"),
    ]);
    expect(three.map((entry) => entry.question)).toEqual(["Pregunta uno", "Pregunta dos", "Pregunta tres"]);
    expect(three.map((entry) => entry.answer)).toEqual(["Respuesta uno", "Respuesta dos", "Respuesta tres"]);
  });

  it("visibleDotWindow muestra todos los puntos si caben y acota una ventana centrada", () => {
    expect(visibleDotWindow(0, 0)).toEqual([]);
    expect(visibleDotWindow(5, 0)).toEqual([0, 1, 2, 3, 4]);
    expect(visibleDotWindow(5, 3)).toEqual([0, 1, 2, 3, 4]);

    const window100 = visibleDotWindow(100, 50);
    expect(window100.length).toBeLessThanOrEqual(30);
    expect(window100).toContain(50);
    for (const index of window100) {
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(100);
    }
    const ascending = window100.every((value, position) => position === 0 || value > (window100[position - 1] ?? -1));
    expect(ascending).toBe(true);

    // Extremos: la ventana nunca sale del rango.
    expect(visibleDotWindow(100, 0)).toContain(0);
    expect(visibleDotWindow(100, 99)).toContain(99);
  });
});

describe("T60 — SSR del navbar, el selector y el riel", () => {
  it("el cluster del asistente conserva las acciones sin barra superior", () => {
    const markup = html(
      createElement(AssistantNavbar, {
        chatTitle: "Análisis de T60",
        hasMessages: true,
        isPinned: false,
        contextCount: 2,
        onOpenContext: () => {},
        onRenameChat: () => {},
        onTogglePin: () => {},
        onNewChat: () => {},
        onShareChat: () => {},
        onCopyAllText: () => {},
        onExportMarkdown: () => {},
        onDeleteChat: () => {},
        onOpenSearch: () => {},
      }),
    );

    expect(markup).toContain('aria-label="Nuevo chat"');
    expect(markup).toContain('aria-label="Agregar contexto"');
    expect(markup).toContain('aria-label="Más opciones del chat"');
    // Ya no hay barra: ni header, ni borde inferior, ni sticky, ni título arriba.
    expect(markup).not.toContain("<header");
    expect(markup).not.toContain("border-b");
    expect(markup).not.toContain("sticky");
    expect(markup).not.toContain("Análisis de T60");
  });

  it("el selector de contexto cerrado no renderiza nada ni exige QueryClient", () => {
    expect(ContextPicker).toBeDefined();

    const empty = html(
      createElement(ContextPicker as ContextPickerComponent, {
        open: false,
        onOpenChange: () => {},
        selected: [],
        onToggle: () => {},
      }),
    );
    expect(empty).toBe("");
  });

  it("el riel sólo aparece con dos o más preguntas del usuario", () => {
    const single = html(
      createElement(QuestionRail, {
        messages: [message("u1", "user", "¿Cómo va NVDAx?")],
      }),
    );
    expect(single).toBe("");

    const pair = html(
      createElement(QuestionRail, {
        messages: [
          message("u1", "user", "¿Cómo va NVDAx?"),
          message("a1", "assistant", "NVDAx sube 2 % hoy."),
          message("u2", "user", "¿Y Tesla?"),
          message("a2", "assistant", "Tesla baja 1 %."),
        ],
      }),
    );
    expect(pair).toContain('aria-label="Navegar por tus preguntas"');
    expect(pair).toContain("Pregunta 1:");
    expect(pair).toContain("Pregunta 2:");
  });
});

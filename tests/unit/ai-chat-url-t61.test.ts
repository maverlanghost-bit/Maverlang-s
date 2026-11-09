/**
 * T61 — URL canónica del chat y limpieza del estado vacío / navbar / sidebar.
 *
 * El environment de vitest es "node": no hay DOM. Los componentes se renderizan
 * con `renderToStaticMarkup` + `createElement` (nunca JSX) y las comprobaciones
 * de markup que dependen de providers pesados se hacen leyendo la fuente con
 * `fs` (normalizando comentarios) en vez de montar media app.
 *
 * `parseChatPath` se normaliza con `parsedId` para aceptar tanto un id suelto
 * como `{ chatId }`: el contrato de Bot 1 devuelve el objeto, pero la
 * especificación del test habla de "null" a secas.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// El estado vacío del transcript no usa `next/link`, pero el resto del árbol de
// mensajes sí: se reemplaza por un ancla plana para poder importar el módulo.
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ href, children, ...props }: { href: string; children?: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

import { Transcript } from "@/components/ai/transcript";
import {
  CHAT_ID_PATTERN,
  chatPath,
  isValidChatId,
  parseChatPath,
  replaceChatUrl,
} from "@/components/ai/chat-url";
import * as welcomeChips from "@/components/ai/welcome-chips";
import { asistenteCopy } from "@/content/i18n/extra-asistente";

const ROOT = process.cwd();

function readSource(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

/** Quita comentarios para que una nota vieja no haga fallar una regla de código. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Acepta `{ chatId }` (contrato real) o el id suelto (lectura literal del pedido). */
function parsedId(pathname: string): string | null {
  const parsed = parseChatPath(pathname) as unknown as { chatId?: string | null } | string | null;
  if (typeof parsed === "string") return parsed;
  return parsed?.chatId ?? null;
}

describe("T61 — isValidChatId", () => {
  it("acepta ids seguros de 6 a 64 caracteres", () => {
    expect(CHAT_ID_PATTERN).toBeInstanceOf(RegExp);

    const valid = [
      "abc123",
      "A_b-9z0",
      "123456",
      "a".repeat(64),
    ];
    for (const id of valid) {
      expect(isValidChatId(id), `debería aceptar ${id.length} chars: ${id}`).toBe(true);
    }
  });

  it("rechaza vacío, largos fuera de rango, separadores y markup", () => {
    const invalid = [
      "",
      "abc12", // 5
      "a".repeat(65),
      "abc/123",
      "..",
      "../etc",
      "abc 123",
      "<script>",
      null,
      undefined,
      123456,
    ];
    for (const id of invalid) {
      expect(isValidChatId(id), `debería rechazar ${String(id)}`).toBe(false);
    }
  });

  it("el patrón y el helper coinciden en los bordes del rango", () => {
    expect(CHAT_ID_PATTERN.test("a".repeat(6))).toBe(true);
    expect(CHAT_ID_PATTERN.test("a".repeat(64))).toBe(true);
    expect(CHAT_ID_PATTERN.test("a".repeat(5))).toBe(false);
    expect(CHAT_ID_PATTERN.test("a".repeat(65))).toBe(false);
  });
});

describe("T61 — chatPath", () => {
  it("sin id cae en la vista general del asistente", () => {
    expect(chatPath(null)).toBe("/app/asistente");
    expect(chatPath(undefined)).toBe("/app/asistente");
  });

  it("con id compone la ruta del chat", () => {
    expect(chatPath("abc123")).toBe("/app/asistente/c/abc123");
  });

  it("un id inválido no inventa una ruta de chat", () => {
    expect(chatPath("../etc")).toBe("/app/asistente");
    expect(chatPath("abc 123")).toBe("/app/asistente");
  });
});

describe("T61 — parseChatPath", () => {
  it("lee el id con y sin barra final", () => {
    expect(parsedId("/app/asistente/c/abc123")).toBe("abc123");
    expect(parsedId("/app/asistente/c/abc123/")).toBe("abc123");
  });

  it("tolera query string y hash", () => {
    expect(parsedId("/app/asistente/c/abc123?tab=1")).toBe("abc123");
    expect(parsedId("/app/asistente/c/abc123/?tab=1")).toBe("abc123");
    expect(parsedId("/app/asistente/c/abc123#fin")).toBe("abc123");
  });

  it("la vista general no tiene id", () => {
    expect(parsedId("/app/asistente")).toBeNull();
    expect(parsedId("/app/asistente/")).toBeNull();
    expect(parsedId("/app/asistente?ticker=TSLAx")).toBeNull();
  });

  it("un id inválido devuelve null", () => {
    expect(parsedId("/app/asistente/c/abc12")).toBeNull();
    expect(parsedId("/app/asistente/c/abc%20123")).toBeNull();
    expect(parsedId("/app/asistente/c/")).toBeNull();
    expect(parsedId("/app/asistente/c/abc123/extra")).toBeNull();
    expect(parsedId("/app/otra/c/abc123")).toBeNull();
  });

  it("no deja pasar path traversal ni segmentos codificados", () => {
    expect(parsedId("/app/asistente/c/..")).toBeNull();
    expect(parsedId("/app/asistente/c/../../etc/passwd")).toBeNull();
    expect(parsedId("/app/asistente/c/..%2Fetc")).toBeNull();
    expect(parsedId("/app/asistente/c/%2e%2e%2fetc")).toBeNull();
  });
});

describe("T61 — replaceChatUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sin window (SSR) no lanza", () => {
    vi.stubGlobal("window", undefined);
    expect(globalThis.window).toBeUndefined();

    expect(() => replaceChatUrl("abc123")).not.toThrow();
    expect(() => replaceChatUrl(null)).not.toThrow();
  });

  it("escribe la ruta sin recargar, conserva el state y no repite la URL actual", () => {
    const state = { desde: "test" };
    const calls: Array<{ state: unknown; url: string }> = [];
    const fakeWindow = {
      location: { pathname: "/app/asistente", search: "", hash: "" },
      history: {
        state,
        replaceState(nextState: unknown, _title: string, url: string) {
          calls.push({ state: nextState, url });
        },
      },
    };
    vi.stubGlobal("window", fakeWindow);

    replaceChatUrl("abc123");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/app/asistente/c/abc123");
    expect(calls[0]?.state).toBe(state);

    // Ya estamos en esa ruta: no se vuelve a escribir.
    fakeWindow.location.pathname = "/app/asistente/c/abc123";
    replaceChatUrl("abc123");
    expect(calls).toHaveLength(1);

    // Volver a la vista general sí actualiza la URL.
    replaceChatUrl(null);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe("/app/asistente");
  });

  it("nunca lanza aunque el historial del navegador falle", () => {
    vi.stubGlobal("window", {
      location: { pathname: "/app/asistente", search: "", hash: "" },
      history: {
        state: null,
        replaceState() {
          throw new Error("history bloqueado");
        },
      },
    });

    expect(() => replaceChatUrl("abc123")).not.toThrow();
  });
});

describe("T61 — estado vacío del asistente", () => {
  it("el transcript vacío muestra los chips y ya no el bloque «Sugerencias»", () => {
    const markup = renderToStaticMarkup(
      createElement(Transcript, {
        copy: asistenteCopy.esCL,
        messages: [],
        typing: false,
        announcement: "",
        onRetry: () => {},
        renderWidgets: () => null,
      }),
    );

    expect(markup).toContain("data-welcome-chips");
    expect(markup).toContain("Acciones rápidas");
    expect(markup).toContain("Analizar tu portafolio");
    expect(markup).not.toContain("data-prompt-suggestions");
    expect(markup).not.toContain("Sugerencias");
  });

  it("la fuente del transcript ya no importa ni menciona las sugerencias", () => {
    const transcript = withoutComments(readSource("components/ai/transcript.tsx"));

    expect(transcript).not.toContain("PromptSuggestions");
    expect(transcript).not.toContain("data-prompt-suggestions");
    expect(transcript).not.toContain("Sugerencias");
    // El estado vacío sigue montando los chips reales.
    expect(transcript).toContain("WelcomeChips");
  });

  it("welcome-chips deja de exportar PromptSuggestions y PROMPT_SUGGESTIONS", () => {
    const moduleExports = welcomeChips as unknown as Record<string, unknown>;

    expect(typeof moduleExports.WelcomeChips).toBe("function");
    expect(moduleExports.PromptSuggestions).toBeUndefined();
    expect(moduleExports.PROMPT_SUGGESTIONS).toBeUndefined();
  });
});

describe("T61 — navbar y sidebar", () => {
  it("el cluster del navbar separa los círculos sin solape ni anillo blanco", () => {
    const navbar = withoutComments(readSource("components/ai/assistant-navbar.tsx"));

    expect(navbar).not.toContain("-ml-2");
    expect(navbar).not.toContain("ring-2 ring-white");
    expect(navbar).toMatch(/gap-2\.5/);
    // Las tres acciones siguen ahí.
    expect(navbar).toContain('aria-label="Nuevo chat"');
    expect(navbar).toContain('aria-label="Agregar contexto"');
    expect(navbar).toContain('aria-label="Más opciones del chat"');
  });

  it("el sidebar queda sólo con el isotipo, sin texto ni fondo gris", () => {
    const sidebar = withoutComments(readSource("components/app-shell/sidebar.tsx"));

    expect(sidebar).not.toContain("Maverlang AI");
    expect(sidebar).not.toContain("bg-zinc-900/5");
    // La marca sigue enlazando al mercado con su logo.
    expect(sidebar).toContain("Maverlang Logo-2.png");
  });
});

describe("T61 — regla [data-bare-input] en globals.css", () => {
  it("existe después de C-07 para ganarle el empate de especificidad", () => {
    const css = readSource("app/globals.css");

    const c07 = css.indexOf("C-07");
    expect(c07).toBeGreaterThan(-1);

    const c07Outline = css.indexOf("outline: 2px solid #0a0a0a", c07);
    expect(c07Outline).toBeGreaterThan(c07);

    const bare = css.indexOf("[data-bare-input]", c07Outline);
    expect(bare).toBeGreaterThan(c07Outline);

    // La regla neutraliza el contorno negro de C-07 en los campos sin caja.
    const block = css.slice(bare, css.indexOf("}", bare));
    expect(block).toMatch(/outline:\s*(none|0)\b/);
  });
});

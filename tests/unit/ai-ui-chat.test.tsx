import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({
      href,
      children,
      ...props
    }: {
      href: string;
      children?: React.ReactNode;
      className?: string;
      "aria-label"?: string;
    }) => React.createElement("a", { href, ...props }, children),
  };
});

import { AskAiLink } from "@/components/ai/ask-ai-button";
import { Composer } from "@/components/ai/composer";
import { fittedSize, MAX_EDGE } from "@/components/ai/image";
import {
  AI_HISTORY_KEY,
  aiChatResponseSchema,
  announceAssistant,
  askAiHref,
  buildAiRequest,
  clearChatHistory,
  endpointFor,
  parseHistory,
  readChatHistory,
  safeBuyHref,
  seedQuestion,
  writeChatHistory,
  type ChatMessage,
  type KeyValueStore,
} from "@/components/ai/model";
import { Transcript } from "@/components/ai/transcript";
import { asistenteCopy, asistenteText } from "@/content/i18n/extra-asistente";

const copy = asistenteCopy.esCL;
const ROOT = path.resolve(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

function memory(options?: { throwFirst?: boolean }): KeyValueStore & { snapshot: () => string | null; key: () => string } {
  let raw: string | null = null;
  let calls = 0;
  let key = "";
  return {
    getItem: (next) => {
      key = next;
      return raw;
    },
    setItem: (next, value) => {
      calls += 1;
      key = next;
      if (options?.throwFirst && calls === 1) throw new Error("quota");
      raw = value;
    },
    removeItem: (next) => {
      key = next;
      raw = null;
    },
    snapshot: () => raw,
    key: () => key,
  };
}

describe("chat del asistente", () => {
  it("precarga ?q= y, si no hay texto, arma la pregunta del ticker", () => {
    expect(seedQuestion("  ¿Cómo va Tesla hoy?  ", "AAPLx", copy.seed)).toBe("¿Cómo va Tesla hoy?");
    expect(seedQuestion("", "AAPLx", copy.seed)).toBe("¿Cómo va AAPLx?");
    expect(seedQuestion("   ", "no vale", copy.seed)).toBe("");
    expect(askAiHref("AAPLx")).toBe("/app/asistente?ticker=AAPLx");
    expect(askAiHref("no vale")).toBe("/app/asistente");
  });

  it("la foto va a importar y el texto al chat, con el ticker de contexto", () => {
    expect(endpointFor(true)).toBe("/api/ai/import-portfolio");
    expect(endpointFor(false)).toBe("/api/ai/chat");
    const messages: ChatMessage[] = [
      { id: "1", role: "user", text: "Foto de mi cartera", imageDataUrl: "data:image/jpeg;base64,aaa" },
      { id: "2", role: "assistant", text: "", notice: { kind: "upstream", message: "no" } },
    ];
    expect(buildAiRequest({ messages, image: "data:image/jpeg;base64,aaa", ticker: "AAPLx" })).toEqual({
      messages: [{ role: "user", content: "Foto de mi cartera" }],
      image: "data:image/jpeg;base64,aaa",
      context: { ticker: "AAPLx" },
    });
  });

  it("guarda la conversación en sessionStorage y la recupera", () => {
    const store = memory();
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "user",
        text: "Hola",
        widgets: [{ type: "stock", ticker: "AAPLx", name: "Apple", priceUsd: 1, changePct: null, range: "1D", points: [] }],
      },
    ];
    writeChatHistory(store, messages);
    expect(store.key()).toBe(AI_HISTORY_KEY);
    expect(readChatHistory(store)).toEqual(messages);
    clearChatHistory(store);
    expect(readChatHistory(store)).toEqual([]);
    expect(parseHistory("{")).toEqual([]);
    expect(parseHistory(JSON.stringify([{ id: "", role: "user", text: "x" }, { id: "ok", role: "user", text: "Hola" }]))).toEqual([
      { id: "ok", role: "user", text: "Hola" },
    ]);
  });

  it("si no cabe la foto, guarda el texto igual", () => {
    const store = memory({ throwFirst: true });
    writeChatHistory(store, [
      { id: "1", role: "user", text: "Foto", imageDataUrl: "data:image/jpeg;base64,aaaa" },
    ]);
    const saved = store.snapshot() ?? "";
    expect(saved).toContain("Foto");
    expect(saved).not.toContain("data:image");
  });

  it("encoge la foto al lado largo de 1600 px", () => {
    expect(MAX_EDGE).toBe(1600);
    expect(fittedSize(3200, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fittedSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fittedSize(0, -4)).toEqual({ width: 1, height: 1 });
  });

  it("acepta la respuesta y descarta un widget desconocido", () => {
    const parsed = aiChatResponseSchema.parse({
      ok: true,
      text: "Así va.",
      widgets: [
        { type: "nope" },
        {
          type: "buy",
          ticker: "AAPLx",
          name: "Apple",
          href: "/app/accion/AAPLx?operar=comprar",
        },
      ],
    });
    expect(parsed).toEqual({
      ok: true,
      text: "Así va.",
      widgets: [{ type: "buy", ticker: "AAPLx", name: "Apple", href: "/app/accion/AAPLx?operar=comprar" }],
    });
    const missing = aiChatResponseSchema.parse({
      ok: false,
      error: "not_configured",
      message: "El asistente aún no está configurado",
    });
    expect(missing).toEqual({
      ok: false,
      error: "not_configured",
      message: "El asistente aún no está configurado",
    });
  });

  it("sólo deja pasar rutas internas de compra", () => {
    expect(safeBuyHref("/app/accion/AAPLx?operar=comprar")).toBe("/app/accion/AAPLx?operar=comprar");
    expect(safeBuyHref("https://evil.example")).toBeNull();
    expect(safeBuyHref("//evil.example")).toBeNull();
    expect(safeBuyHref("javascript:alert(1)")).toBeNull();
  });

  it("el botón flotante apunta al asistente con el ticker", () => {
    const markup = html(createElement(AskAiLink, { ticker: "TSLAx", label: copy.ask, about: copy.askAbout }));
    expect(markup).toContain('href="/app/asistente?ticker=TSLAx"');
    expect(markup).toContain("Preguntar a la IA");
    expect(markup).toContain("Preguntar a la IA sobre TSLAx");
    expect(markup).toContain("focus-visible:ring-4");
  });

  it("el compositor tiene chips, foto, cámara y el aviso fijo", () => {
    const markup = html(
      createElement(Composer, {
        copy,
        draft: "",
        pendingImage: null,
        typing: false,
        photoError: null,
        suggestions: true,
        onDraft: () => {},
        onSubmit: () => {},
        onSuggest: () => {},
        onAttach: () => {},
        onFile: () => {},
        onRemoveImage: () => {},
        fileRef: { current: null },
      }),
    );
    expect(markup).toContain("¿Cómo va Tesla hoy?");
    expect(markup).toContain("Compara Apple y Microsoft");
    expect(markup).toContain("¿Cómo va mi cartera?");
    expect(markup).toContain("Importar foto de mi cartera");
    expect(markup).toContain('accept="image/jpeg,image/png"');
    expect(markup).toContain('capture="environment"');
    expect(markup).toContain("No es recomendación de inversión");
    expect(markup).toContain("Escribe tu pregunta");
    expect(markup).toContain('aria-label="Adjuntar foto"');
    expect(markup).toContain('aria-label="Enviar"');
    const disclaimerAt = markup.indexOf("No es recomendación de inversión");
    const inputAt = markup.indexOf("Escribe tu pregunta");
    expect(disclaimerAt).toBeGreaterThan(inputAt);
  });

  it("la conversación anuncia al asistente y muestra el estado escribiendo", () => {
    const markup = html(
      createElement(Transcript, {
        copy,
        typing: true,
        announcement: "Escribiendo",
        onRetry: () => {},
        messages: [{ id: "u1", role: "user", text: "¿Cómo va Tesla hoy?" }],
        renderWidgets: () => createElement("p", null, "widget"),
      }),
    );
    expect(markup).toContain("¿Cómo va Tesla hoy?");
    expect(markup).toContain("Escribiendo");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("motion-safe:animate-pulse");
    expect(markup).toContain("motion-reduce:animate-none");
  });

  it("el anuncio lee el texto y no una recomendación", () => {
    const text = announceAssistant(
      {
        text: "Apple cotiza así.",
        widgets: [{ type: "buy", ticker: "AAPLx", name: "Apple", href: "/app/accion/AAPLx?operar=comprar" }],
      },
      { ready: copy.ready, compare: copy.compareTitle, portfolio: copy.portfolioTitle, buy: copy.buyCta, photo: copy.photoCaption },
    );
    expect(text).toContain("Apple cotiza así.");
    expect(text).toContain("Ver para comprar");
    expect(text.toLowerCase()).not.toContain("recomend");
  });

  it("los textos es-CL y en tienen las mismas claves", () => {
    expect(Object.keys(asistenteCopy.esCL).sort()).toEqual(Object.keys(asistenteCopy.en).sort());
    expect(asistenteText("es-CL").disclaimer).toBe("No es recomendación de inversión");
    expect(asistenteText("es-CL").notConfigured).toBe("El asistente aún no está configurado");
    expect(asistenteText("en").suggestions.map((item) => item.id)).toEqual(
      asistenteText("es-CL").suggestions.map((item) => item.id),
    );
  });

  it("la pantalla usa el viewport, el historial y los dos endpoints", () => {
    const screen = read("app/(platform)/app/asistente/asistente-screen.tsx");
    const view = read("components/ai/chat-view.tsx");
    const frame = read("components/ai/use-chat-viewport.ts");
    const stack = read("components/ai/widget-stack.tsx");
    const page = read("app/(platform)/app/asistente/page.tsx");
    expect(frame).toContain("visualViewport");
    expect(view).toContain("100dvh");
    expect(frame).toContain("--app-tabs-height");
    expect(screen).toContain("readChatHistory");
    expect(screen).toContain("writeChatHistory");
    expect(screen).toContain("compressImageFile");
    expect(screen).toContain("endpointFor");
    expect(page).toContain("params.q");
    expect(page).toContain("params.ticker");
    expect(stack).toContain('from "@/components/ai/import/import-preview"');
    expect(stack).toContain("<ImportPreview");
    expect(screen).not.toContain("/api/trade");
    expect(read("components/ai/transcript.tsx")).toContain("prefers-reduced-motion");
  });
});

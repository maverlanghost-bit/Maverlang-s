import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ href, children, ...props }: { href: string; children?: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

import { AssistantNavbar } from "@/components/ai/assistant-navbar";
import { CodeBlock, detectCodeLanguage, isCodeSnippet } from "@/components/ai/code-block";
import { InteractiveQuestionCard } from "@/components/ai/interactive-question-card";
import { AssistantMessageActions } from "@/components/ai/message-actions";
import { AI_MODELS, ModelSelector } from "@/components/ai/model-selector";
import type { ChatMessage } from "@/components/ai/model";
import { ChatSearchDialog, NavChatsHistory } from "@/components/ai/nav-chats";
import { ReasoningAccordion, extractThinkingSegments } from "@/components/ai/reasoning-accordion";
import { exportChatToMarkdown, groupSavedChatsByDate, type SavedChatItem } from "@/components/ai/sessions-store";
import { ShareChatDialog } from "@/components/ai/share-chat-dialog";
import { SourcesList, ToolAccordion, formatCitationSource } from "@/components/ai/tool-accordion";
import { computeStreamStep } from "@/components/ai/use-smoothed-stream";
import { WELCOME_ACTIONS, WelcomeChips } from "@/components/ai/welcome-chips";

const ROOT = path.resolve(__dirname, "..", "..");
/** Etiquetas de razonamiento construidas por código para no depender del markup del test. */
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);
const OPEN = `${LT}think${GT}`;
const CLOSE = `${LT}/think${GT}`;

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

function html(node: ReactElement | null): string {
  return node ? renderToStaticMarkup(node) : "";
}

function message(id: string, role: "user" | "assistant", text: string): ChatMessage {
  return { id, role, text };
}

function chat(id: string, title: string, updatedAt: number, pinned = false): SavedChatItem {
  return {
    id,
    title,
    updatedAt,
    pinned,
    messages: [message(`${id}-u`, "user", title), message(`${id}-a`, "assistant", `Respuesta a ${title}`)],
  };
}

describe("T58 — integración de ai-chat-extracted en el asistente", () => {
  it("expone los dos modelos de Maverlang en el selector", () => {
    expect(AI_MODELS.map((model) => model.id)).toEqual(["fast", "pro"]);
    expect(AI_MODELS[0]?.name).toBe("Maverlang v2.5");
    expect(AI_MODELS[1]?.name).toBe("Maverlang v2.5 Pro");

    const markup = html(createElement(ModelSelector, { selectedModel: "pro" }));
    expect(markup).toContain("Maverlang v2.5 Pro");
    expect(markup).toContain('aria-haspopup="listbox"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-label="Elegir modelo"');
  });

  it("la barra superior desaparece: el chat sólo muestra el cluster de acciones", () => {
    const withMessages = html(
      createElement(AssistantNavbar, {
        chatTitle: "Análisis de NVDAx",
        hasMessages: true,
        isPinned: true,
        contextCount: 2,
        onOpenContext: () => {},
        onRenameChat: () => {},
        onNewChat: () => {},
        onShareChat: () => {},
        onOpenSearch: () => {},
        onTogglePin: () => {},
        onDeleteChat: () => {},
        onCopyAllText: () => {},
        onExportMarkdown: () => {},
      }),
    );
    // El cluster flotante conserva las tres acciones del chat.
    expect(withMessages).toContain('aria-label="Nuevo chat"');
    expect(withMessages).toContain('aria-label="Agregar contexto"');
    expect(withMessages).toContain('aria-label="Más opciones del chat"');
    // El título ya no se pinta arriba y no queda rastro de la barra.
    expect(withMessages).not.toContain("Análisis de NVDAx");
    expect(withMessages).not.toContain("<header");
    expect(withMessages).not.toContain("border-b");
    expect(withMessages).not.toContain("sticky");

    const empty = html(createElement(AssistantNavbar, { chatTitle: "Nueva conversación", hasMessages: false }));
    // Sin mensajes el menú sigue disponible (Buscar), pero cerrado: no se ve
    // "Compartir conversación" ni el título de la conversación.
    expect(empty).toContain('aria-label="Más opciones del chat"');
    expect(empty).not.toContain("Compartir conversación");
    expect(empty).not.toContain("Nueva conversación");
    expect(empty).not.toContain("<header");
  });

  it("los chips de bienvenida usan los prompts de Maverlang", () => {
    expect(WELCOME_ACTIONS).toHaveLength(5);

    const chips = html(createElement(WelcomeChips, { onSendMessage: () => {} }));
    for (const label of ["Analizar tu portafolio", "Crear un portafolio", "Noticias del mercado", "Estrategia de inversión"]) {
      expect(chips).toContain(label);
    }
    expect(chips).toContain('aria-label="Acciones rápidas"');
    expect(chips).toContain("data-welcome-chips");

    // Cada chip emite su acción y un prompt propio (el estado vacío ya no
    // tiene el bloque «Sugerencias» que vivía bajo los chips).
    for (const action of WELCOME_ACTIONS) {
      expect(chips).toContain(`data-welcome-action="${action.id}"`);
      expect(action.prompt.trim().length).toBeGreaterThan(0);
    }
  });

  it("detecta código pegado y lo renderiza con su lenguaje", () => {
    const code = "interface Punto {\n  x: number;\n}\nconst p: Punto = { x: 1 };";
    expect(isCodeSnippet(code)).toBe(true);
    expect(isCodeSnippet("Hola, ¿cómo va Tesla hoy? Quiero entender el precio.")).toBe(false);
    expect(detectCodeLanguage(code)).toBe("typescript");
    expect(detectCodeLanguage("SELECT id, name FROM users;")).toBe("sql");
    expect(detectCodeLanguage('{"ok": true}')).toBe("json");
    expect(detectCodeLanguage("def saluda():\n    print('hola')")).toBe("python");

    const markup = html(createElement(CodeBlock, { code, showLineNumbers: true }));
    expect(markup).toContain("TYPESCRIPT");
    expect(markup).toContain("Copiar código");
    expect(markup).toContain("4 líneas");
    expect(markup).toContain("<pre");
  });

  it("separa el razonamiento del texto visible y muestra su duración", () => {
    expect(extractThinkingSegments(`Hola  ${OPEN}reviso precios${CLOSE} mundo`)).toEqual({
      reasoning: "reviso precios",
      cleanContent: "Hola mundo",
      isThinkingOpen: false,
    });
    expect(extractThinkingSegments("sólo texto")).toEqual({
      reasoning: null,
      cleanContent: "sólo texto",
      isThinkingOpen: false,
    });
    const open = extractThinkingSegments(`Antes ${OPEN}aún pienso`);
    expect(open.isThinkingOpen).toBe(true);
    expect(open.reasoning).toContain("aún pienso");

    expect(html(createElement(ReasoningAccordion, { reasoning: "pasos", durationSeconds: 3 }))).toContain("Pensó por 3s");
    expect(html(createElement(ReasoningAccordion, { reasoning: "pasos", isStreaming: true }))).toContain("Pensando...");
    expect(html(createElement(ReasoningAccordion, { reasoning: null }))).toBe("");
  });

  it("las acciones del mensaje cubren copiar, feedback, regenerar y escuchar", () => {
    const markup = html(
      createElement(AssistantMessageActions, {
        messageId: "m1",
        content: "Apple cotiza al alza.",
        feedback: "like",
        onFeedback: () => {},
        onRetry: () => {},
        onShare: () => {},
      }),
    );
    expect(markup).toContain('aria-label="Copiar respuesta"');
    expect(markup).toContain('aria-label="Respuesta útil"');
    expect(markup).toContain('aria-label="Respuesta poco útil"');
    expect(markup).toContain('aria-label="Regenerar respuesta"');
    expect(markup).toContain('aria-label="Escuchar respuesta"');
    expect(markup).toContain('aria-label="Compartir respuesta"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('data-message-id="m1"');
  });

  it("formatea fuentes web y documentos, y muestra el estado de la herramienta", () => {
    const web = formatCitationSource("https://www.example.com/informe?q=1");
    expect(web).toEqual({
      displayTitle: "example.com",
      subtitle: "/informe?q=1",
      badge: "Web",
      isWeb: true,
      url: "https://www.example.com/informe?q=1",
    });
    const doc = formatCitationSource("Informe anual 2025 de Maverlang");
    expect(doc.isWeb).toBe(false);
    expect(doc.badge).toBe("Doc");
    expect(doc.url).toBeNull();

    const sources = html(createElement(SourcesList, { sources: ["https://www.example.com/a", "Informe interno"] }));
    expect(sources).toContain("Fuentes consultadas");
    expect(sources).toContain("Web");
    expect(sources).toContain("Doc");
    expect(html(createElement(SourcesList, { sources: [] }))).toBe("");

    const running = html(createElement(ToolAccordion, { name: "market_quote", state: "running" }));
    expect(running).toContain("Precios de mercado");
    expect(running).toContain("En progreso");

    const failed = html(createElement(ToolAccordion, { name: "web_search", state: "error", output: "sin red" }));
    expect(failed).toContain("Error");
    expect(failed).toContain("sin red");
  });

  it("la pregunta interactiva ofrece opciones, texto libre y saltar", () => {
    const markup = html(
      createElement(InteractiveQuestionCard, {
        data: {
          id: "q1",
          question: "¿Cuál es tu horizonte?",
          options: [
            { id: "short", label: "Corto plazo", description: "Menos de un año" },
            { id: "long", label: "Largo plazo" },
          ],
        },
        onSubmit: () => {},
        onSkip: () => {},
      }),
    );
    expect(markup).toContain("¿Cuál es tu horizonte?");
    expect(markup).toContain("Corto plazo");
    expect(markup).toContain("Largo plazo");
    expect(markup).toContain("Escribe tu respuesta");
    expect(markup).toContain("Saltar");
    expect(markup).toContain("Continuar");
    expect(markup).toContain('role="radiogroup"');
  });

  it("el modal de compartir sólo se monta abierto y ofrece las dos vistas", () => {
    expect(
      html(
        createElement(ShareChatDialog, {
          open: false,
          onOpenChange: () => {},
          chatTitle: "Chat",
          messages: [],
        }),
      ),
    ).toBe("");

    const markup = html(
      createElement(ShareChatDialog, {
        open: true,
        onOpenChange: () => {},
        chatTitle: "Análisis de Tesla",
        messages: [message("u1", "user", "¿Cómo va Tesla?"), message("a1", "assistant", "Tesla sube.")],
        singlePair: { question: "¿Cómo va Tesla?", answer: "Tesla sube." },
      }),
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain("Compartir conversación");
    expect(markup).toContain("Análisis de Tesla");
    expect(markup).toContain("Esta respuesta");
    expect(markup).toContain("Todo el chat (2)");
    expect(markup).toContain("Copiar texto");
    expect(markup).toContain("Descargar .md");
  });

  it("el historial del chat agrupa y filtra conversaciones", () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12).getTime();
    const previous = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 12, 12).getTime();
    const chats = [
      chat("p1", "Fijada sobre NVDAx", previous, true),
      chat("t1", "Hoy sobre Tesla", today),
      chat("y1", "Ayer sobre Apple", yesterday),
      chat("o1", "Hace días sobre SPYx", previous),
    ];

    const grouped = groupSavedChatsByDate(chats);
    expect(grouped.pinned.map((item) => item.id)).toEqual(["p1"]);
    expect(grouped.today.some((item) => item.id === "t1")).toBe(true);
    expect(grouped.previous.some((item) => item.id === "o1")).toBe(true);
    expect(grouped.pinned.some((item) => item.id === "t1")).toBe(false);

    const filtered = groupSavedChatsByDate(chats, "tesla");
    expect(filtered.today.map((item) => item.id)).toEqual(["t1"]);
    expect(filtered.pinned).toHaveLength(0);

    const markup = html(
      createElement(NavChatsHistory, {
        chats,
        activeChatId: "t1",
        onSelectChat: () => {},
        onNewChat: () => {},
        onRenameChat: () => {},
        onTogglePinChat: () => {},
        onDeleteChat: () => {},
        onShareChat: () => {},
      }),
    );
    expect(markup).toContain("Fijados");
    expect(markup).toContain("Hoy");
    expect(markup).toContain("Anteriores");
    expect(markup).toContain("Fijada sobre NVDAx");
    expect(markup).toContain('aria-label="Buscar en chats"');

    expect(
      html(
        createElement(ChatSearchDialog, {
          open: false,
          onOpenChange: () => {},
          chats,
          onSelectChat: () => {},
          onNewChat: () => {},
        }),
      ),
    ).toBe("");
    const search = html(
      createElement(ChatSearchDialog, {
        open: true,
        onOpenChange: () => {},
        chats,
        onSelectChat: () => {},
        onNewChat: () => {},
      }),
    );
    expect(search).toContain("Buscar en chats");
    expect(search).toContain("Hoy sobre Tesla");
  });

  it("exporta la conversación a Markdown con la marca correcta", () => {
    const markdown = exportChatToMarkdown("Mi análisis", [
      message("u1", "user", "¿Cómo va Tesla?"),
      message("a1", "assistant", "Sube 2 %."),
    ]);
    expect(markdown.startsWith("# Mi análisis")).toBe(true);
    expect(markdown).toContain("### Tú");
    expect(markdown).toContain("### Maverlang IA");
    expect(markdown).toContain("¿Cómo va Tesla?");
    expect(markdown).toContain("Sube 2 %.");
    expect(markdown).not.toContain("undefined");
  });

  it("el suavizado de stream avanza acotado y sin NaN", () => {
    expect(computeStreamStep(0)).toBe(1);
    expect(computeStreamStep(-10)).toBe(1);
    expect(computeStreamStep(Number.NaN)).toBe(1);
    expect(computeStreamStep(7)).toBe(2);
    expect(computeStreamStep(60)).toBe(10);
    expect(computeStreamStep(10_000)).toBe(28);
  });

  it("la pantalla y el sidebar conservan el aislamiento por usuario", () => {
    const screen = read("app/(platform)/app/asistente/asistente-screen.tsx");
    const sidebar = read("components/app-shell/sidebar.tsx");

    for (const marker of [
      "readChatSnapshot",
      "publishChatSnapshot",
      "resolveChatScope",
      "compressImageFile",
      "endpointFor",
      "useSession",
      "resetChatSnapshot",
      "epoch",
      "upsertSavedChat",
      "renameSavedChat",
      "togglePinSavedChat",
      "deleteSavedChat",
      "exportChatToMarkdown",
      "maverlang:ai-select-chat",
      "maverlang:ai-chat-action",
    ]) {
      expect(screen).toContain(marker);
    }
    expect(screen).not.toContain("/api/trade");
    expect(screen).not.toContain("AI_HISTORY_KEY");

    for (const marker of ["useSession", "resolveChatScope", "readChatSnapshot", "NavChatsHistory"]) {
      expect(sidebar).toContain(marker);
    }
    expect(sidebar).not.toContain("mv_ai_chat_v1");
    expect(sidebar).not.toContain("AI_HISTORY_KEY");
  });
});

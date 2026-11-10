import { aiChatResponseSchema, type AiEndpoint } from "@/components/ai/model";
import type { AiChatRequest, AiChatResponse } from "@/components/ai/contract";

export interface PostAssistantOptions {
  /** Texto acumulado de la respuesta según llega (§1.4). */
  onDelta?: (textSoFar: string) => void;
  signal?: AbortSignal;
}

/**
 * SSE de §1.4: `data: {"type":"delta"|"done"|"error",…}` separado por líneas
 * en blanco. Se arma con códigos en vez de escapes para no depender del
 * formato del archivo.
 */
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);

function upstream(): AiChatResponse {
  return { ok: false, error: "upstream", message: "" };
}

function failureFor(status: number): AiChatResponse {
  if (status === 429) return { ok: false, error: "rate_limited", message: "" };
  if (status === 400) return { ok: false, error: "bad_request", message: "" };
  return upstream();
}

/** Respuesta JSON normal: igual que siempre, con los mismos respaldos por estado. */
async function readJson(response: Response): Promise<AiChatResponse> {
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  const parsed = aiChatResponseSchema.safeParse(json);
  if (parsed.success) return parsed.data;
  return failureFor(response.status);
}

/** Contenido de un renglón `data: <json>`, sin el prefijo ni el CR final. */
function dataLine(line: string): string | null {
  const clean = line.endsWith(CR) ? line.slice(0, -1) : line;
  if (!clean.startsWith("data:")) return null;
  return clean.slice("data:".length).trim();
}

/**
 * Lee el SSE hasta el `done` (o el `error`). `onDelta` recibe el texto
 * acumulado. Un corte, un evento inválido o un stream sin cierre terminan en
 * `upstream`, igual que un fallo de red.
 */
async function readStream(response: Response, onDelta: (textSoFar: string) => void): Promise<AiChatResponse> {
  const reader = response.body?.getReader();
  if (!reader) return failureFor(response.status);
  const decoder = new TextDecoder();
  let buffer = "";
  let partial = "";
  const handle = (block: string): AiChatResponse | null => {
    const parts: string[] = [];
    for (const raw of block.split(LF)) {
      const line = dataLine(raw);
      if (line !== null && line !== "") parts.push(line);
    }
    if (parts.length === 0) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(parts.join(LF));
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const event = parsed as {
      type?: unknown;
      text?: unknown;
      widgets?: unknown;
      error?: unknown;
      message?: unknown;
    };
    if (event.type === "delta") {
      if (typeof event.text !== "string" || event.text === "") return null;
      partial += event.text;
      try {
        onDelta(partial);
      } catch {
        // La interfaz ya no escucha; el texto se sigue armando.
      }
      return null;
    }
    if (event.type === "done") {
      const done = aiChatResponseSchema.safeParse({ ok: true, text: event.text, widgets: event.widgets });
      return done.success ? done.data : upstream();
    }
    if (event.type === "error") {
      const failed = aiChatResponseSchema.safeParse({ ok: false, error: event.error, message: event.message });
      return failed.success ? failed.data : upstream();
    }
    return null;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // CRLF o CR suelto → LF, también cuando el corte cae entre dos chunks.
      buffer = (buffer + decoder.decode(value, { stream: true })).split(CR + LF).join(LF).split(CR).join(LF);
      let index = buffer.indexOf(LF + LF);
      while (index >= 0) {
        const handled = handle(buffer.slice(0, index));
        buffer = buffer.slice(index + 2);
        index = buffer.indexOf(LF + LF);
        if (handled) return handled;
      }
    }
    buffer += decoder.decode();
    const tail = buffer.trim() !== "" ? handle(buffer) : null;
    return tail ?? upstream();
  } catch {
    return upstream();
  } finally {
    try {
      await reader.cancel();
    } catch {
      // El stream ya terminó.
    }
  }
}

export async function postAssistant(
  path: AiEndpoint,
  body: AiChatRequest,
  opts: PostAssistantOptions = {},
): Promise<AiChatResponse> {
  const onDelta = opts.onDelta;
  const streaming = typeof onDelta === "function" && path === "/api/ai/chat";

  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: streaming ? "text/event-stream" : "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch {
    return upstream();
  }

  // Si el servidor contestó JSON (error antes del stream), se lee como siempre.
  const type = (response.headers.get("content-type") ?? "").toLowerCase();
  if (streaming && onDelta && type.includes("text/event-stream") && response.body) {
    return readStream(response, onDelta);
  }
  return readJson(response);
}

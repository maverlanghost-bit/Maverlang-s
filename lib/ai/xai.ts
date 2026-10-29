import "server-only";

import { aiMessages } from "@/content/i18n/extra-b";

/**
 * Cliente de xAI (chat completions, compatible con OpenAI).
 * `POST https://api.x.ai/v1/chat/completions`. La clave sale de
 * `XAI_API_KEY` en el momento de la llamada. Sin clave no hay red.
 * No se registra el cuerpo, la imagen ni la clave.
 */

export const XAI_URL = "https://api.x.ai/v1/chat/completions";
export const XAI_TIMEOUT_MS = 25_000;
export const XAI_DEFAULT_MODEL = "grok-4.3";

const copy = aiMessages.esCL;

export class XaiNotConfiguredError extends Error {
  readonly code = "not_configured" as const;

  constructor() {
    super(copy.notConfigured);
    this.name = "XaiNotConfiguredError";
  }
}

export class XaiUpstreamError extends Error {
  readonly code = "upstream" as const;

  constructor(message = copy.upstream) {
    super(message);
    this.name = "XaiUpstreamError";
  }
}

export type XaiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface XaiToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type XaiMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string | XaiContentPart[] | null;
      tool_calls?: XaiToolCallPayload[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export interface XaiToolCallPayload {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface XaiTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties: false;
    };
  };
}

export type XaiResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: Record<string, unknown> };

export interface XaiCompletion {
  content: string;
  toolCalls: XaiToolCall[];
}

export interface CallXaiOptions {
  tools?: readonly XaiTool[];
  responseFormat?: XaiResponseFormat;
  signal?: AbortSignal;
  /** Sólo tests. En la ruta vale `XAI_TIMEOUT_MS` (25 s). */
  timeoutMs?: number;
}

function clean(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+#.*$/, "").trim();
  return text.length > 0 ? text : undefined;
}

/** Clave y modelo leídos al llamar, para que un test pueda fijar el env. */
export function readXaiSettings(source: {
  XAI_API_KEY?: string | undefined;
  XAI_MODEL?: string | undefined;
} = process.env as { XAI_API_KEY?: string; XAI_MODEL?: string }): { apiKey?: string; model: string } {
  const apiKey = clean(source.XAI_API_KEY);
  const modelRaw = clean(source.XAI_MODEL);
  const model = modelRaw && /^[A-Za-z0-9._:-]{1,80}$/.test(modelRaw) ? modelRaw : XAI_DEFAULT_MODEL;
  return apiKey ? { apiKey, model } : { model };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toolCallsOf(message: Record<string, unknown>): XaiToolCall[] {
  if (!Array.isArray(message.tool_calls)) return [];
  const calls: XaiToolCall[] = [];
  for (const entry of message.tool_calls) {
    const row = asRecord(entry);
    const fn = row ? asRecord(row.function) : null;
    if (!row || !fn || typeof fn.name !== "string" || fn.name.trim() === "") continue;
    let args = "";
    if (typeof fn.arguments === "string") args = fn.arguments;
    else if (fn.arguments && typeof fn.arguments === "object") {
      try {
        args = JSON.stringify(fn.arguments);
      } catch {
        args = "";
      }
    }
    const id = typeof row.id === "string" && row.id.trim() !== "" ? row.id : `call_${calls.length}`;
    calls.push({ id, name: fn.name.trim(), arguments: args });
  }
  return calls;
}

function contentOf(message: Record<string, unknown>): string {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    const parts: string[] = [];
    for (const part of message.content) {
      const row = asRecord(part);
      if (row && typeof row.text === "string") parts.push(row.text);
    }
    return parts.join("\n");
  }
  return "";
}

/**
 * Una vuelta a xAI. Sin `XAI_API_KEY` lanza `XaiNotConfiguredError` y no llama
 * a `fetch`. El resto de fallos (red, HTTP, JSON, timeout de 25 s) son
 * `XaiUpstreamError` con un texto fijo, sin el cuerpo del proveedor.
 */
export async function callXai(messages: readonly XaiMessage[], options?: CallXaiOptions): Promise<XaiCompletion> {
  const { apiKey, model } = readXaiSettings();
  if (!apiKey) throw new XaiNotConfiguredError();
  if (messages.length === 0) throw new XaiUpstreamError();

  const timeoutMs = options?.timeoutMs ?? XAI_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onParentAbort = () => controller.abort();
  options?.signal?.addEventListener("abort", onParentAbort, { once: true });

  const payload: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    temperature: 0.2,
    max_tokens: 800,
  };
  if (options?.tools && options.tools.length > 0) {
    payload.tools = options.tools;
    payload.tool_choice = "auto";
  }
  if (options?.responseFormat) payload.response_format = options.responseFormat;

  try {
    const response = await fetch(XAI_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new XaiUpstreamError();
    }
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new XaiUpstreamError();
    }
    const root = asRecord(raw);
    const choices = root && Array.isArray(root.choices) ? root.choices : [];
    const first = asRecord(choices[0]);
    const message = first ? asRecord(first.message) : null;
    if (!message) throw new XaiUpstreamError();
    return { content: contentOf(message), toolCalls: toolCallsOf(message) };
  } catch (error) {
    if (error instanceof XaiNotConfiguredError || error instanceof XaiUpstreamError) throw error;
    if (controller.signal.aborted) throw new XaiUpstreamError(copy.timeout);
    throw new XaiUpstreamError();
  } finally {
    clearTimeout(timer);
    options?.signal?.removeEventListener("abort", onParentAbort);
  }
}

import { z } from "zod";

import type { AiChatRequest, AiWidget } from "@/components/ai/contract";

/** Misma escala que el dominio: 0,012 = 1,2 %. */
export type ChatNotice = {
  kind: "not_configured" | "rate_limited" | "bad_request" | "upstream";
  message: string;
};

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  widgets?: AiWidget[];
  imageDataUrl?: string;
  notice?: ChatNotice;
}

export type AiEndpoint = "/api/ai/chat" | "/api/ai/import-portfolio";

export const AI_HISTORY_KEY = "mv_ai_chat_v1";
export const MAX_TEXT = 2_000;
export const MAX_HISTORY = 40;
export const MAX_API_TURNS = 16;
export const MAX_POINTS = 400;
export const CHART_W = 320;
export const CHART_H = 96;

const pointSchema = z.object({
  t: z.number().finite(),
  p: z.number().finite(),
});

const stockSchema = z.object({
  type: z.literal("stock"),
  ticker: z.string().trim().min(1),
  name: z.string(),
  priceUsd: z.number().finite().nullable(),
  changePct: z.number().finite().nullable(),
  range: z.enum(["1D", "1W", "1M"]),
  points: z.array(pointSchema),
});

const compareSchema = z.object({
  type: z.literal("compare"),
  range: z.enum(["1W", "1M", "1Y"]),
  items: z.array(
    z.object({
      ticker: z.string().trim().min(1),
      name: z.string(),
      changePct: z.number().finite().nullable(),
      points: z.array(pointSchema),
    }),
  ),
});

const portfolioSchema = z.object({
  type: z.literal("portfolio"),
  totalUsd: z.number().finite().nullable(),
  pnlPct: z.number().finite().nullable(),
  positions: z.array(
    z.object({
      ticker: z.string().trim().min(1),
      name: z.string(),
      valueUsd: z.number().finite().nullable(),
      weightPct: z.number().finite().nullable(),
    }),
  ),
});

const buySchema = z.object({
  type: z.literal("buy"),
  ticker: z.string().trim().min(1),
  name: z.string(),
  href: z.string(),
});

const importSchema = z.object({
  type: z.literal("import-preview"),
  positions: z.array(
    z.object({
      ticker: z.string(),
      name: z.string().nullable(),
      quantity: z.number().finite().nullable(),
      matched: z.boolean(),
    }),
  ),
});

const widgetSchema = z.union([stockSchema, compareSchema, portfolioSchema, buySchema, importSchema]);

const okSchema = z
  .object({
    ok: z.literal(true),
    text: z.string(),
    widgets: z.array(z.unknown()),
  })
  .transform((value) => ({
    ok: true as const,
    text: value.text,
    widgets: parseWidgets(value.widgets),
  }));

const errSchema = z.object({
  ok: z.literal(false),
  error: z.enum(["not_configured", "rate_limited", "bad_request", "upstream"]),
  message: z.string(),
});

export const aiChatResponseSchema = z.union([okSchema, errSchema]);

const storedMessageSchema = z.object({
  id: z.string().trim().min(1),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  widgets: z.array(z.unknown()).optional(),
  imageDataUrl: z.string().optional(),
  notice: z
    .object({
      kind: z.enum(["not_configured", "rate_limited", "bad_request", "upstream"]),
      message: z.string(),
    })
    .optional(),
});

export function parseWidgets(input: readonly unknown[]): AiWidget[] {
  const widgets: AiWidget[] = [];
  for (const item of input) {
    const parsed = widgetSchema.safeParse(item);
    if (!parsed.success) continue;
    widgets.push(trimWidget(parsed.data));
  }
  return widgets;
}

function trimWidget(widget: z.infer<typeof widgetSchema>): AiWidget {
  if (widget.type === "stock") {
    return { ...widget, points: widget.points.slice(-MAX_POINTS) };
  }
  if (widget.type === "compare") {
    return {
      ...widget,
      items: widget.items.map((item) => ({ ...item, points: item.points.slice(-MAX_POINTS) })),
    };
  }
  return widget;
}

export function parseStoredMessage(input: unknown): ChatMessage | null {
  const parsed = storedMessageSchema.safeParse(input);
  if (!parsed.success) return null;
  const message: ChatMessage = {
    id: parsed.data.id,
    role: parsed.data.role,
    text: parsed.data.text.slice(0, MAX_TEXT),
  };
  if (parsed.data.widgets) message.widgets = parseWidgets(parsed.data.widgets);
  const image = parsed.data.imageDataUrl;
  if (image && (image.startsWith("data:image/jpeg") || image.startsWith("data:image/png"))) {
    message.imageDataUrl = image;
  }
  if (parsed.data.notice) message.notice = parsed.data.notice;
  return message;
}

export function parseHistory(raw: string | null): ChatMessage[] {
  if (!raw) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(json)) return [];
  const messages: ChatMessage[] = [];
  for (const item of json) {
    const message = parseStoredMessage(item);
    if (message) messages.push(message);
  }
  return messages.slice(-MAX_HISTORY);
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const MAX_STORE_CHARS = 1_200_000;

export function browserStore(): KeyValueStore | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readChatHistory(store: KeyValueStore | null): ChatMessage[] {
  if (!store) return [];
  try {
    return parseHistory(store.getItem(AI_HISTORY_KEY));
  } catch {
    return [];
  }
}

function withoutImages(messages: readonly ChatMessage[]): ChatMessage[] {
  return messages.map((message) => {
    if (!message.imageDataUrl) return message;
    const next = { ...message };
    delete next.imageDataUrl;
    return next;
  });
}

export function writeChatHistory(store: KeyValueStore | null, messages: readonly ChatMessage[]): void {
  if (!store) return;
  const trimmed = messages.slice(-MAX_HISTORY);
  const full = JSON.stringify(trimmed);
  const payload = full.length > MAX_STORE_CHARS ? JSON.stringify(withoutImages(trimmed)) : full;
  try {
    store.setItem(AI_HISTORY_KEY, payload);
  } catch {
    try {
      store.setItem(AI_HISTORY_KEY, JSON.stringify(withoutImages(trimmed)));
    } catch {
      // Sin espacio: la conversación sigue en memoria.
    }
  }
}

export function clearChatHistory(store: KeyValueStore | null): void {
  if (!store) return;
  try {
    store.removeItem(AI_HISTORY_KEY);
  } catch {
    // Nada que borrar.
  }
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Símbolo de catálogo, sin espacios ni rutas. */
export function cleanTicker(value: string): string | undefined {
  const ticker = value.trim().slice(0, 32);
  if (!/^[A-Za-z0-9.]+$/.test(ticker)) return undefined;
  return ticker;
}

export function detailHref(ticker: string): string | null {
  const symbol = cleanTicker(ticker);
  if (!symbol) return null;
  return `/app/accion/${encodeURIComponent(symbol)}`;
}

/** Sólo rutas internas. El botón no abre sitios ni ejecuta compras. */
export function safeBuyHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return null;
  if (trimmed.includes("\\") || trimmed.includes("://")) return null;
  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed.charCodeAt(index) < 32) return null;
  }
  return trimmed;
}

export function askAiHref(ticker: string): string {
  const symbol = cleanTicker(ticker);
  if (!symbol) return "/app/asistente";
  const params = new URLSearchParams();
  params.set("ticker", symbol);
  return `/app/asistente?${params.toString()}`;
}

export function seedQuestion(query: string, ticker: string, template: string): string {
  const text = query.replace(/\s+/g, " ").trim().slice(0, 500);
  if (text) return text;
  const symbol = cleanTicker(ticker);
  if (!symbol) return "";
  return template.replaceAll("{ticker}", symbol);
}

export function endpointFor(hasImage: boolean): AiEndpoint {
  return hasImage ? "/api/ai/import-portfolio" : "/api/ai/chat";
}

export function toApiMessages(messages: readonly ChatMessage[]): AiChatRequest["messages"] {
  const turns: AiChatRequest["messages"] = [];
  for (const message of messages) {
    if (message.notice) continue;
    const content = message.text.trim();
    if (!content) continue;
    turns.push({ role: message.role, content: content.slice(0, MAX_TEXT) });
  }
  return turns.slice(-MAX_API_TURNS);
}

export function buildAiRequest(input: {
  messages: readonly ChatMessage[];
  image?: string;
  ticker?: string;
}): AiChatRequest {
  const request: AiChatRequest = { messages: toApiMessages(input.messages) };
  if (input.image) request.image = input.image;
  const ticker = input.ticker ? cleanTicker(input.ticker) : undefined;
  if (ticker) request.context = { ticker };
  return request;
}

export function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Variación desde el primer precio. 0,10 = +10 %. Null si no hay base. */
export function normalizeToRatio(points: readonly { t: number; p: number }[]): number[] | null {
  if (points.length < 2) return null;
  const base = points[0]?.p;
  if (base == null || !Number.isFinite(base) || base === 0) return null;
  const ratios: number[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.p)) return null;
    ratios.push((point.p - base) / base);
  }
  return ratios;
}

const PAD = 2;

export function seriesPath(
  values: readonly number[],
  width: number,
  height: number,
  min: number,
  max: number,
): string | null {
  if (values.length < 2 || width <= PAD * 2 || height <= PAD * 2) return null;
  const span = max - min || 1;
  const innerW = width - PAD * 2;
  const innerH = height - PAD * 2;
  let d = "";
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? min;
    const x = PAD + (index / (values.length - 1)) * innerW;
    const y = PAD + innerH - ((value - min) / span) * innerH;
    d += `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    if (index < values.length - 1) d += " ";
  }
  return d;
}

/** Incluye el 0 para que las series partan de la misma línea. */
export function compareScale(series: readonly (readonly number[])[]): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const values of series) {
    for (const value of values) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  if (min === max) {
    min -= 0.01;
    max += 0.01;
  }
  return { min, max };
}

export function valueY(value: number, height: number, min: number, max: number): number {
  const span = max - min || 1;
  const innerH = height - PAD * 2;
  return PAD + innerH - ((value - min) / span) * innerH;
}

export function announceAssistant(
  message: Pick<ChatMessage, "text" | "widgets" | "notice">,
  labels: { ready: string; compare: string; portfolio: string; buy: string; photo: string },
): string {
  if (message.notice) return message.notice.message.trim();
  const bits: string[] = [];
  const text = message.text.trim();
  if (text) bits.push(text);
  for (const widget of message.widgets ?? []) {
    if (widget.type === "stock") bits.push(`${widget.name} (${widget.ticker})`);
    else if (widget.type === "compare") bits.push(labels.compare);
    else if (widget.type === "portfolio") bits.push(labels.portfolio);
    else if (widget.type === "buy") bits.push(`${labels.buy} ${widget.name}`);
    else bits.push(labels.photo);
  }
  if (bits.length === 0) return labels.ready;
  return bits.join(". ");
}

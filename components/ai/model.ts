import { z } from "zod";

import type { AiChatRequest, AiWidget } from "@/components/ai/contract";
import { aiMessages } from "@/content/i18n/extra-b";
import type { SessionStatus } from "@/lib/auth/types";

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

/**
 * Clave histórica sin identidad. Queda en cuarentena: no se migra ni se
 * presenta a ninguna cuenta, porque no hay forma de atribuirla con seguridad.
 */
export const AI_HISTORY_KEY = "mv_ai_chat_v1";
export const AI_HISTORY_SCOPE_PREFIX = "mv_ai_chat_v2";
/** El invitado no escribe en `sessionStorage`: sólo memoria de esta pestaña. */
export const AI_GUEST_SCOPE_KEY = `${AI_HISTORY_SCOPE_PREFIX}::guest-memory`;

export type ChatScope =
  | { kind: "account"; key: string; storageKey: string }
  | { kind: "guest"; key: string; storageKey: null };

export const MAX_TEXT = 2_000;
export const MAX_HISTORY = 40;
export const MAX_API_TURNS = 16;
export const MAX_POINTS = 400;
/** Tope defensivo de los widgets nuevos: el historial completo vive en `sessionStorage`. */
const MAX_FACTS = 16;
const MAX_POSITIONS = 60;
export const CHART_W = 320;
export const CHART_H = 96;

/**
 * El servidor agrega su aviso al final de las respuestas sobre acciones.
 * La interfaz muestra un aviso permanente bajo el compositor, así que aquí se
 * quita esa copia del texto para no repetir el mismo mensaje en pantalla.
 */
const INLINE_NOTICES = [aiMessages.esCL.disclaimer, aiMessages.en.disclaimer].flatMap((notice) => [
  notice,
  notice.replace(/\.$/, ""),
]);

export function stripInlineNotice(text: string): string {
  let out = text.trimEnd();
  let changed = true;
  while (changed) {
    changed = false;
    for (const notice of INLINE_NOTICES) {
      if (!out.endsWith(notice)) continue;
      out = out.slice(0, -notice.length).trimEnd();
      changed = true;
    }
  }
  return out;
}

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

const companySchema = z.object({
  type: z.literal("company"),
  ticker: z.string().trim().min(1),
  name: z.string(),
  facts: z.array(
    z.object({
      label: z.string(),
      value: z.string().nullable(),
    }),
  ),
  source: z.string(),
  asOf: z.string().nullable(),
});

const portfolioTodaySchema = z.object({
  type: z.literal("portfolio-today"),
  totalUsd: z.number().finite().nullable(),
  cashUsdc: z.number().finite().nullable(),
  positions: z.array(
    z.object({
      ticker: z.string().trim().min(1),
      name: z.string(),
      valueUsd: z.number().finite().nullable(),
      weightPct: z.number().finite().nullable(),
      changePct: z.number().finite().nullable(),
    }),
  ),
  hhi: z.number().finite().nullable(),
  effectivePositions: z.number().finite().nullable(),
  top1Pct: z.number().finite().nullable(),
  top3Pct: z.number().finite().nullable(),
});

const simulationSchema = z.object({
  type: z.literal("simulation"),
  ticker: z.string().trim().min(1),
  name: z.string(),
  priceUsd: z.number().finite().nullable(),
  amountUsd: z.number().finite().nullable(),
  units: z.number().finite().nullable(),
  monthlyClp: z.number().finite().nullable(),
  usdClp: z.number().finite().nullable(),
  monthlyUsd: z.number().finite().nullable(),
  months: z.number().finite().nullable(),
  totalUsd: z.number().finite().nullable(),
});

const alertConfirmSchema = z.object({
  type: z.literal("alert-confirm"),
  ticker: z.string().trim().min(1),
  name: z.string(),
  direction: z.enum(["above", "below"]),
  thresholdUsd: z.number().finite(),
  priceUsd: z.number().finite().nullable(),
});

const widgetSchema = z.union([
  stockSchema,
  compareSchema,
  portfolioSchema,
  buySchema,
  importSchema,
  companySchema,
  portfolioTodaySchema,
  simulationSchema,
  alertConfirmSchema,
]);

const okSchema = z
  .object({
    ok: z.literal(true),
    text: z.string(),
    widgets: z.array(z.unknown()),
  })
  .transform((value) => ({
    ok: true as const,
    text: stripInlineNotice(value.text),
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
  if (widget.type === "company") {
    return { ...widget, facts: widget.facts.slice(0, MAX_FACTS) };
  }
  if (widget.type === "portfolio-today") {
    return { ...widget, positions: widget.positions.slice(0, MAX_POSITIONS) };
  }
  return widget;
}

export function parseStoredMessage(input: unknown): ChatMessage | null {
  const parsed = storedMessageSchema.safeParse(input);
  if (!parsed.success) return null;
  const message: ChatMessage = {
    id: parsed.data.id,
    role: parsed.data.role,
    text: (parsed.data.role === "assistant" ? stripInlineNotice(parsed.data.text) : parsed.data.text).slice(
      0,
      MAX_TEXT,
    ),
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

function fnv1a32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Huella estable y opaca de la identidad. La clave de `sessionStorage` no
 * guarda el id de la cuenta, así el historial de otra sesión no se puede
 * identificar leyendo las claves del navegador.
 */
export function chatIdentityFingerprint(userId: string): string {
  const first = fnv1a32(userId, 0x811c9dc5);
  const second = fnv1a32(userId, 0x9e3779b9);
  return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

/**
 * Identidad del chat:
 * - `loading` no tiene scope (no lee ni escribe nada);
 * - `unauthenticated` usa memoria de pestaña, sin persistencia;
 * - `authenticated` usa una clave propia derivada del id.
 *
 * Nunca devuelve la clave histórica sin identidad.
 */
export function resolveChatScope(
  status: SessionStatus,
  userId: string | null | undefined,
): ChatScope | null {
  if (status === "loading") return null;
  if (status === "unauthenticated") {
    return { kind: "guest", key: AI_GUEST_SCOPE_KEY, storageKey: null };
  }
  const id = (userId ?? "").trim();
  if (!id) return null;
  const key = `${AI_HISTORY_SCOPE_PREFIX}::u:${chatIdentityFingerprint(id)}`;
  return { kind: "account", key, storageKey: key };
}

const EMPTY_HISTORY: ChatMessage[] = [];

/** Snapshot en memoria de un solo scope: al cambiar identidad se descarta. */
let snapshotScopeKey: string | null | undefined;
let snapshotMessages: ChatMessage[] = EMPTY_HISTORY;

/**
 * Devuelve la conversación del scope activo. Si la identidad cambió, vacía la
 * memoria anterior y sólo entonces lee la clave de la nueva identidad. Un
 * scope `null` (sesión cargando) no lee nada.
 */
export function readChatSnapshot(scope: ChatScope | null): ChatMessage[] {
  const key = scope?.key ?? null;
  if (snapshotScopeKey === key) return snapshotMessages;
  snapshotScopeKey = key;
  const history = scope?.storageKey ? readChatHistory(browserStore(), scope.storageKey) : EMPTY_HISTORY;
  snapshotMessages = history.length === 0 ? EMPTY_HISTORY : history;
  return snapshotMessages;
}

/**
 * Publica en el scope capturado. Si la identidad ya cambió, rechaza la
 * escritura para que una respuesta tardía no caiga en la cuenta equivocada.
 */
export function publishChatSnapshot(scope: ChatScope | null, messages: readonly ChatMessage[]): boolean {
  const key = scope?.key ?? null;
  if (snapshotScopeKey !== key) return false;
  const next = messages.length === 0 ? EMPTY_HISTORY : messages.slice(-MAX_HISTORY);
  snapshotMessages = next;
  if (scope?.storageKey) writeChatHistory(browserStore(), next, scope.storageKey);
  return true;
}

/** "Nuevo chat": borra sólo el scope actual (nunca la clave histórica ni otro usuario). */
export function resetChatSnapshot(scope: ChatScope | null): void {
  snapshotScopeKey = scope?.key ?? null;
  snapshotMessages = EMPTY_HISTORY;
  if (scope?.storageKey) clearChatHistory(browserStore(), scope.storageKey);
}

/** Lee una clave explícita. Sin clave usa la histórica, que sólo está en cuarentena. */
export function readChatHistory(store: KeyValueStore | null, key: string = AI_HISTORY_KEY): ChatMessage[] {
  if (!store) return [];
  try {
    return parseHistory(store.getItem(key));
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

export function writeChatHistory(
  store: KeyValueStore | null,
  messages: readonly ChatMessage[],
  key: string = AI_HISTORY_KEY,
): void {
  if (!store) return;
  const trimmed = messages.slice(-MAX_HISTORY);
  const full = JSON.stringify(trimmed);
  const payload = full.length > MAX_STORE_CHARS ? JSON.stringify(withoutImages(trimmed)) : full;
  try {
    store.setItem(key, payload);
  } catch {
    try {
      store.setItem(key, JSON.stringify(withoutImages(trimmed)));
    } catch {
      // Sin espacio: la conversación sigue en memoria.
    }
  }
}

export function clearChatHistory(store: KeyValueStore | null, key: string = AI_HISTORY_KEY): void {
  if (!store) return;
  try {
    store.removeItem(key);
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
    const content = (message.role === "assistant" ? stripInlineNotice(message.text) : message.text).trim();
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
    else if (widget.type === "portfolio" || widget.type === "portfolio-today") bits.push(labels.portfolio);
    else if (widget.type === "buy") bits.push(`${labels.buy} ${widget.name}`);
    else if (widget.type === "import-preview") bits.push(labels.photo);
    else if (widget.type === "company" || widget.type === "simulation" || widget.type === "alert-confirm")
      bits.push(`${widget.name} (${widget.ticker})`);
  }
  if (bits.length === 0) return labels.ready;
  return bits.join(". ");
}

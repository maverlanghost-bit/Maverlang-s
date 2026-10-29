import "server-only";

import { z } from "zod";

import { ONDO_TICKERS, type OndoEntry } from "@/config/ondo.generated";
import { TICKERS } from "@/config/tickers";
import {
  NOT_CONFIGURED_MESSAGE,
  fillImport,
  importarText,
  type ImportarMessages,
} from "@/content/i18n/extra-importar";
import { isCatalogSymbol } from "@/lib/catalog/symbol";
import { fold } from "@/lib/market/browse";
import { ipOfRequest, limit, RATE_LIMIT_POLICIES, type RateLimitPolicy } from "@/lib/security/rate-limit";
import type { Ticker } from "@/lib/types";

/**
 * Lectura de una foto de cartera. No guarda filas ni la imagen:
 * la foto sale en la llamada a xAI y se descarta.
 * `callXai` es local: `@/lib/ai/xai` y `@/lib/ai/run-chat` no están en esta parte.
 */

export const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";
export const DEFAULT_XAI_MODEL = "grok-4.3";
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** El data URL en base64 de una foto de 4 MB, más el JSON. */
export const MAX_IMPORT_BODY_BYTES = 6 * 1024 * 1024;
export const MAX_IMPORT_POSITIONS = 40;

/** Cuerpo de POST /api/ai/import-portfolio. La foto no se guarda. */
export const importPortfolioRequestSchema = z
  .object({
    image: z.string().trim().min(1).max(MAX_IMPORT_BODY_BYTES),
  })
  .strict();

const modelRowSchema = z.object({
  ticker: z.union([z.string(), z.null()]).optional(),
  name: z.union([z.string(), z.null()]).optional(),
  quantity: z.union([z.number(), z.string(), z.null()]).optional(),
  price: z.union([z.number(), z.string(), z.null()]).optional(),
});

const modelPayloadSchema = z.object({
  positions: z.array(z.unknown()),
});

const LOCAL_AI_POLICY: RateLimitPolicy = { limit: 10, windowMs: 60_000 };
const LEGAL_SUFFIX = /\b(incorporated|corporation|inc|corp|ltd|limited|plc|company|co)\b/g;

const PROMPT = [
  "Lee la foto de una cartera o de un listado.",
  "Devuelve sólo filas que se ven. No inventes tickers, nombres, cantidades ni precios.",
  "Si un dato no se lee, usa null.",
  "ticker: símbolo bursátil, o null. name: nombre de la empresa, o null.",
  "quantity: cantidad de unidades, número o null. price: número que se lee, o null.",
  "Si no hay filas, positions es un arreglo vacío.",
  "No opines y no recomiendes.",
].join(" ");

export const PORTFOLIO_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "portfolio_import",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["positions"],
      properties: {
        positions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["ticker", "name", "quantity", "price"],
            properties: {
              ticker: { type: ["string", "null"] },
              name: { type: ["string", "null"] },
              quantity: { type: ["number", "null"] },
              price: { type: ["number", "null"] },
            },
          },
        },
      },
    },
  },
} as const;

export type CatalogRef = {
  symbol: string;
  name: string;
  underlying: string;
  /** Si el texto no trae el símbolo, este emisor es el que se elige. */
  preferred: boolean;
};

export type ImportPreviewPosition = {
  ticker: string;
  name: string | null;
  quantity: number | null;
  matched: boolean;
};

/** Misma forma que `AiChatResponse` de `@/lib/ai/types` para este flujo. */
export type VisionChatResponse =
  | { ok: true; text: string; widgets: { type: "import-preview"; positions: ImportPreviewPosition[] }[] }
  | {
      ok: false;
      error: "not_configured" | "rate_limited" | "bad_request" | "upstream";
      message: string;
    };

export type ImageInspection =
  | { ok: true; dataUrl: string; mediaType: "image/png" | "image/jpeg" }
  | { ok: false };

type Extracted = {
  ticker: string | null;
  name: string | null;
  quantity: number | null;
};

type FetchImpl = typeof fetch;

export function hasXaiKey(source: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(source.XAI_API_KEY?.trim());
}

export function xaiModel(source: NodeJS.ProcessEnv = process.env): string {
  const raw = source.XAI_MODEL?.trim();
  return raw || DEFAULT_XAI_MODEL;
}

export function aiLimitPolicy(): RateLimitPolicy {
  const named = (RATE_LIMIT_POLICIES as { ai?: RateLimitPolicy }).ai;
  if (named && named.limit > 0 && named.windowMs > 0) return named;
  return LOCAL_AI_POLICY;
}

/** Tope de la política `ai`, o el equivalente local si esa política aún no existe. */
export async function reserveAiCall(subject: string): Promise<{ ok: boolean; resetMs: number }> {
  const safe = subject.trim().replace(/:/g, "_").slice(0, 200) || "unknown";
  const result = await limit(`maverlang:rl:ai:${safe}`, aiLimitPolicy());
  return { ok: result.ok, resetMs: result.resetMs };
}

export function rateSubject(userId: string | null, req: Request): string {
  if (userId && userId.trim()) return `user:${userId.trim()}`;
  return `ip:${ipOfRequest(req)}`;
}

let cachedCatalog: CatalogRef[] | null = null;

/** xStocks habilitados más Ondo. Una ficha por símbolo. */
export function offeredCatalog(): readonly CatalogRef[] {
  cachedCatalog ??= buildOfferedCatalog();
  return cachedCatalog;
}

export function resolveTicker(raw: string, catalog: readonly CatalogRef[] = offeredCatalog()): CatalogRef | null {
  return indexCatalog(catalog).resolve(raw);
}

export function inspectImageDataUrl(value: string): ImageInspection {
  const trimmed = value.trim();
  const match = /^data:image\/(png|jpeg|jpg);base64,([a-z0-9+/=]+)$/i.exec(trimmed);
  if (!match) return { ok: false };
  const payload = match[2] ?? "";
  const maxChars = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
  if (payload.length < 8 || payload.length > maxChars) return { ok: false };
  let bytes: Buffer;
  try {
    bytes = Buffer.from(payload, "base64");
  } catch {
    return { ok: false };
  }
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return { ok: false };
  const subtype = (match[1] ?? "").toLowerCase();
  const mediaType = subtype === "png" ? "image/png" : "image/jpeg";
  if (mediaType === "image/png" && !isPng(bytes)) return { ok: false };
  if (mediaType === "image/jpeg" && !isJpeg(bytes)) return { ok: false };
  return { ok: true, dataUrl: `data:${mediaType};base64,${payload}`, mediaType };
}

export async function importPortfolioFromImage(input: {
  image: string;
  language?: "es-CL" | "en";
  fetchImpl?: FetchImpl;
  apiKey?: string | null;
  model?: string;
  catalog?: readonly CatalogRef[];
}): Promise<VisionChatResponse> {
  const copy = importarText(input.language ?? "es-CL");
  const apiKey = input.apiKey === undefined ? process.env.XAI_API_KEY?.trim() ?? "" : input.apiKey.trim();
  if (!apiKey) {
    return { ok: false, error: "not_configured", message: NOT_CONFIGURED_MESSAGE };
  }
  const image = inspectImageDataUrl(input.image);
  if (!image.ok) return { ok: false, error: "bad_request", message: copy.badImage };
  let payload: unknown;
  try {
    payload = await callXai({
      apiKey,
      model: input.model?.trim() || xaiModel(),
      imageDataUrl: image.dataUrl,
      fetchImpl: input.fetchImpl ?? fetch,
    });
  } catch {
    return { ok: false, error: "upstream", message: copy.upstream };
  }
  const extracted = readExtracted(payload);
  if (!extracted) return { ok: false, error: "upstream", message: copy.upstream };
  const matched = matchExtracted(extracted, input.catalog ?? offeredCatalog());
  const positions = matched.slice(0, MAX_IMPORT_POSITIONS);
  return {
    ok: true,
    text: summaryText(copy, positions.length, matched.length > MAX_IMPORT_POSITIONS),
    widgets: [{ type: "import-preview", positions }],
  };
}

export async function callXai(input: {
  apiKey: string;
  model: string;
  imageDataUrl: string;
  fetchImpl?: FetchImpl;
}): Promise<unknown> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(XAI_CHAT_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      max_tokens: 2000,
      stream: false,
      response_format: PORTFOLIO_RESPONSE_FORMAT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: input.imageDataUrl } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error("xai");
  }
  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    throw new Error("xai");
  }
  const text = contentText(envelope);
  if (!text) throw new Error("xai");
  try {
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as unknown;
  } catch {
    throw new Error("xai");
  }
}

function summaryText(copy: ImportarMessages, count: number, capped: boolean): string {
  if (count === 0) return copy.emptyPhoto;
  return fillImport(capped ? copy.foundCapped : copy.foundPhoto, { count });
}

function buildOfferedCatalog(): CatalogRef[] {
  const xByUnderlying = new Map<string, Ticker>();
  for (const ticker of TICKERS) {
    if (!ticker.enabled || !isCatalogSymbol(ticker.symbol)) continue;
    xByUnderlying.set(fold(ticker.underlying), ticker);
  }
  const ondoByUnderlying = new Map<string, OndoEntry>();
  for (const entry of ONDO_TICKERS) {
    if (!isCatalogSymbol(entry.symbol)) continue;
    ondoByUnderlying.set(fold(entry.ticker), entry);
  }
  const refs: CatalogRef[] = [];
  const seen = new Set<string>();
  for (const ticker of xByUnderlying.values()) {
    const ondo = ondoByUnderlying.get(fold(ticker.underlying));
    refs.push({
      symbol: ticker.symbol,
      name: ticker.name,
      underlying: ticker.underlying,
      preferred: !ondo || ondo.volumeWinner !== "ondo",
    });
    seen.add(ticker.symbol);
  }
  for (const entry of ondoByUnderlying.values()) {
    if (seen.has(entry.symbol)) continue;
    const hasX = xByUnderlying.has(fold(entry.ticker));
    refs.push({
      symbol: entry.symbol,
      name: entry.name,
      underlying: entry.ticker,
      preferred: entry.volumeWinner === "ondo" || !hasX,
    });
  }
  return refs;
}

function indexCatalog(catalog: readonly CatalogRef[]) {
  const bySymbol = new Map<string, CatalogRef>();
  const byUnderlying = new Map<string, CatalogRef[]>();
  const byName = new Map<string, CatalogRef[]>();
  for (const ref of catalog) {
    const symbolKey = compact(ref.symbol);
    if (symbolKey && !bySymbol.has(symbolKey)) bySymbol.set(symbolKey, ref);
    pushGroup(byUnderlying, compact(ref.underlying), ref);
    for (const key of nameKeys(ref.name)) pushGroup(byName, key, ref);
  }
  return {
    resolve(raw: string): CatalogRef | null {
      const symbolKey = compact(raw);
      if (!symbolKey) return null;
      const exact = bySymbol.get(symbolKey);
      if (exact) return exact;
      const byTicker = pickOne(byUnderlying.get(symbolKey) ?? []);
      if (byTicker) return byTicker;
      for (const key of nameKeys(raw)) {
        const found = pickOne(byName.get(key) ?? []);
        if (found) return found;
      }
      return null;
    },
  };
}

function pushGroup(map: Map<string, CatalogRef[]>, key: string, ref: CatalogRef) {
  if (key.length < 1) return;
  const list = map.get(key) ?? [];
  if (!list.some((item) => item.symbol === ref.symbol)) list.push(ref);
  map.set(key, list);
}

function pickOne(candidates: readonly CatalogRef[]): CatalogRef | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] ?? null;
  const underlyings = new Set(candidates.map((item) => fold(item.underlying)));
  if (underlyings.size !== 1) return null;
  const preferred = candidates.filter((item) => item.preferred);
  if (preferred.length === 1) return preferred[0] ?? null;
  const xstock = candidates.find((item) => item.symbol.endsWith("x") && !item.symbol.endsWith("on"));
  return xstock ?? candidates[0] ?? null;
}

function compact(value: string): string {
  return fold(value).replace(/[\s$]/g, "").slice(0, 80);
}

function nameKeys(name: string): string[] {
  const spaced = fold(name)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const stripped = stripLegal(spaced);
  const noCom = stripped.replace(/\s+com$/, "").trim();
  const keys = new Set<string>();
  for (const key of [spaced, stripped, noCom]) {
    if (key.length >= 2) keys.add(key);
  }
  return [...keys];
}

function stripLegal(value: string): string {
  LEGAL_SUFFIX.lastIndex = 0;
  return value.replace(LEGAL_SUFFIX, " ").replace(/\s+/g, " ").trim();
}

function matchExtracted(rows: readonly Extracted[], catalog: readonly CatalogRef[]): ImportPreviewPosition[] {
  const index = indexCatalog(catalog);
  const positions: ImportPreviewPosition[] = [];
  for (const row of rows) {
    const query = row.ticker ?? row.name ?? "";
    const found = query ? index.resolve(query) : null;
    if (found && isCatalogSymbol(found.symbol)) {
      positions.push({
        ticker: found.symbol,
        name: found.name,
        quantity: row.quantity,
        matched: true,
      });
      continue;
    }
    const raw = cleanLabel(row.ticker, 40) ?? cleanLabel(row.name, 40);
    if (!raw) continue;
    positions.push({
      ticker: raw,
      name: cleanLabel(row.name, 80),
      quantity: row.quantity,
      matched: false,
    });
  }
  return positions;
}

function readExtracted(payload: unknown): Extracted[] | null {
  const rows = unwrapPositions(payload);
  if (!rows) return null;
  const extracted: Extracted[] = [];
  for (const item of rows) {
    const row = readRow(item);
    if (row) extracted.push(row);
  }
  return extracted;
}

function unwrapPositions(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload.slice(0, 80);
  const wrapped = modelPayloadSchema.safeParse(payload);
  if (!wrapped.success) return null;
  return wrapped.data.positions.slice(0, 80);
}

function readRow(item: unknown): Extracted | null {
  const parsed = modelRowSchema.safeParse(item);
  if (!parsed.success) return null;
  // `price` se valida y se descarta: no entra en el widget ni se guarda.
  const ticker = cleanLabel(parsed.data.ticker, 40);
  const name = cleanLabel(parsed.data.name, 80);
  if (!ticker && !name) return null;
  return { ticker, name, quantity: readQuantity(parsed.data.quantity) };
}

function cleanLabel(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || /data:image/i.test(text)) return null;
  return text.slice(0, max);
}

function readQuantity(value: unknown): number | null {
  if (typeof value === "number") return cleanNumber(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s/g, "");
  if (!trimmed) return null;
  const normalized =
    trimmed.includes(",") && trimmed.includes(".")
      ? trimmed.replace(/\./g, "").replace(",", ".")
      : trimmed.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return cleanNumber(Number(normalized));
}

function cleanNumber(value: number): number | null {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) return null;
  return value;
}

function contentText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: { content?: unknown } } | undefined)?.message;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const part of content) {
    if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
      parts.push((part as { text: string }).text);
    }
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

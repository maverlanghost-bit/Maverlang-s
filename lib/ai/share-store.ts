import "server-only";

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import {
  countActiveSharedChatRows,
  insertSharedChatRow,
  revokeSharedChatRow,
  selectSharedChatRow,
  shareSupabaseConfigured,
} from "@/lib/services/ai-share.supabase";

export const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;
export const MAX_SHARED_MESSAGES = 40;
export const MAX_SHARED_TITLE_LENGTH = 160;
export const MAX_SHARED_TEXT_LENGTH = 12_000;
/** Enlaces vigentes por persona (WEB-3). */
export const MAX_ACTIVE_SHARES_PER_OWNER = 50;
/** Vigencia de un enlace; coincide con el default de `expires_at` en la base. */
export const SHARE_TTL_MS = 90 * 24 * 3_600_000;
const MAX_MOCK_SHARED_CHATS = 200;

export const sharedMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(MAX_SHARED_TEXT_LENGTH),
});

export const createSharedChatSchema = z.object({
  title: z.string().trim().min(1).max(MAX_SHARED_TITLE_LENGTH),
  messages: z.array(sharedMessageSchema).min(1).max(MAX_SHARED_MESSAGES),
});

export type SharedChatMessage = z.infer<typeof sharedMessageSchema>;

export type SharedChatRecord = {
  id: string;
  title: string;
  messages: SharedChatMessage[];
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string | null;
};

type StoredRecord = SharedChatRecord & { ownerId?: string | null };

export type CreateSharedChatInput = {
  title: string;
  messages: readonly SharedChatMessage[];
  ownerId?: string | null;
};

/** No hay un almacén seguro disponible (producción sin Supabase o sin las columnas 0058). */
export class ShareStoreUnavailableError extends Error {
  constructor(message = "El almacén de chats compartidos no está disponible.") {
    super(message);
    this.name = "ShareStoreUnavailableError";
  }
}

/** La persona ya tiene el máximo de enlaces vigentes. */
export class ShareLimitError extends Error {
  constructor() {
    super(`Ya tienes ${MAX_ACTIVE_SHARES_PER_OWNER} enlaces compartidos activos. Revoca alguno para crear otro.`);
    this.name = "ShareLimitError";
  }
}

type SupabaseSharedChatRow = {
  id: string;
  title: string;
  messages: unknown;
  created_at: string;
  expires_at?: string | null;
  revoked_at?: string | null;
};

export type ShareStoreDeps = {
  /** Sólo tests: `"live"` fuerza Supabase y cualquier otro valor, memoria. */
  dataMode?: () => string;
  insertLive?: (row: {
    id: string;
    owner_id: string | null;
    title: string;
    messages: SharedChatMessage[];
  }) => Promise<SupabaseSharedChatRow>;
  selectLive?: (id: string) => Promise<SupabaseSharedChatRow | null>;
  countActiveLive?: (ownerId: string) => Promise<number>;
  revokeLive?: (id: string, ownerId: string) => Promise<boolean>;
  mockFilePath?: string;
  now?: () => number;
};

type StoreMode = "supabase" | "memory";

const GLOBAL_STORE_KEY = "__maverlangSharedChats";
const DEFAULT_MOCK_FILE = path.join(os.tmpdir(), "maverlang-ai-shared-chats.json");

function getMemoryStore(): Map<string, StoredRecord> {
  const globalRecord = globalThis as typeof globalThis & {
    [GLOBAL_STORE_KEY]?: Map<string, StoredRecord>;
  };
  if (!globalRecord[GLOBAL_STORE_KEY]) {
    globalRecord[GLOBAL_STORE_KEY] = new Map<string, StoredRecord>();
  }
  return globalRecord[GLOBAL_STORE_KEY];
}

function readMockFile(filePath: string): Record<string, StoredRecord> {
  try {
    if (!existsSync(filePath)) return {};
    const raw = readFileSync(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, StoredRecord>;
  } catch {
    return {};
  }
}

function writeMockFile(filePath: string, data: Record<string, StoredRecord>): void {
  try {
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, JSON.stringify(data), "utf8");
  } catch {
    // En entornos de sólo lectura el respaldo en memoria sigue funcionando.
  }
}

/**
 * Supabase siempre que haya cliente admin (independiente de `DATA_MODE`: la
 * config segura de producción es AUTH_MODE=supabase con DATA_MODE=mock).
 * Sin Supabase: memoria/archivo sólo fuera de producción; en producción, 503.
 */
function resolveMode(deps?: ShareStoreDeps): StoreMode {
  if (deps?.dataMode) return deps.dataMode().trim() === "live" ? "supabase" : "memory";
  if (process.env.NODE_ENV === "test") return "memory";
  if (shareSupabaseConfigured()) return "supabase";
  if (process.env.NODE_ENV === "production") throw new ShareStoreUnavailableError();
  return "memory";
}

/** Para la ruta: `true` si el almacén puede usarse en este entorno. */
export function shareStoreAvailable(): boolean {
  try {
    resolveMode();
    return true;
  } catch {
    return false;
  }
}

function stripControlChars(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

function sanitizeTitle(value: string): string {
  const cleaned = stripControlChars(value.replace(/[\r\n]+/g, " "));
  return cleaned.slice(0, MAX_SHARED_TITLE_LENGTH);
}

function sanitizeMessages(messages: readonly SharedChatMessage[]): SharedChatMessage[] {
  const out: SharedChatMessage[] = [];
  for (const item of messages) {
    if (out.length >= MAX_SHARED_MESSAGES) break;
    const text = stripControlChars(item.text).slice(0, MAX_SHARED_TEXT_LENGTH);
    if (!text) continue;
    out.push({
      role: item.role,
      text,
    });
  }
  return out;
}

export function isValidShareId(value: unknown): value is string {
  return typeof value === "string" && SHARE_ID_PATTERN.test(value);
}

export function generateShareId(): string {
  // 12 bytes en base64url = 16 caracteres URL-safe [A-Za-z0-9_-].
  return randomBytes(12).toString("base64url");
}

function parseUuidOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(trimmed) ? trimmed : null;
}

function nowOf(deps?: ShareStoreDeps): number {
  return deps?.now ? deps.now() : Date.now();
}

/** Vigente = sin revocar y con vencimiento futuro. Un vencimiento ilegible cuenta como vencido. */
function isLive(
  record: { createdAt: string; expiresAt?: string | null; revokedAt?: string | null },
  now: number,
): boolean {
  if (record.revokedAt) return false;
  const expires = record.expiresAt
    ? Date.parse(record.expiresAt)
    : Date.parse(record.createdAt) + SHARE_TTL_MS;
  return Number.isFinite(expires) && expires > now;
}

function activeCount(records: Iterable<StoredRecord>, ownerId: string, now: number): number {
  let count = 0;
  for (const record of records) {
    if (record.ownerId === ownerId && isLive(record, now)) count += 1;
  }
  return count;
}

function publicRecord(record: StoredRecord): SharedChatRecord {
  return {
    id: record.id,
    title: record.title,
    messages: record.messages,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt ?? null,
  };
}

/**
 * Valida y persiste una conversación compartida de sólo lectura. Los mensajes
 * del asistente ya vienen verificados por la ruta (firma HMAC).
 */
export async function createSharedChat(
  input: CreateSharedChatInput,
  deps?: ShareStoreDeps,
): Promise<SharedChatRecord> {
  const cleanedTitle = sanitizeTitle(input.title);
  const cleanedMessages = sanitizeMessages(input.messages);
  const validated = createSharedChatSchema.parse({
    title: cleanedTitle,
    messages: cleanedMessages,
  });

  const id = generateShareId();
  const mode = resolveMode(deps);
  const now = nowOf(deps);

  if (mode === "supabase") {
    const ownerId = parseUuidOrNull(input.ownerId);
    if (!ownerId) throw new ShareStoreUnavailableError("Se necesita una cuenta para compartir.");
    const count = await (deps?.countActiveLive ?? countActiveSharedChatRows)(ownerId);
    if (count >= MAX_ACTIVE_SHARES_PER_OWNER) throw new ShareLimitError();
    const insert = deps?.insertLive ?? insertSharedChatRow;
    const inserted = await insert({
      id,
      owner_id: ownerId,
      title: validated.title,
      messages: validated.messages,
    });
    const parsedMessages = z.array(sharedMessageSchema).safeParse(inserted.messages);
    return {
      id: inserted.id,
      title: sanitizeTitle(inserted.title) || validated.title,
      messages: parsedMessages.success ? parsedMessages.data : validated.messages,
      createdAt: inserted.created_at,
      expiresAt: inserted.expires_at ?? undefined,
      revokedAt: inserted.revoked_at ?? null,
    };
  }

  const ownerId = input.ownerId?.trim() || null;
  const record: StoredRecord = {
    id,
    title: validated.title,
    messages: validated.messages,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SHARE_TTL_MS).toISOString(),
    revokedAt: null,
    ownerId,
  };

  const memory = getMemoryStore();
  const filePath = deps?.mockFilePath ?? DEFAULT_MOCK_FILE;
  const current = readMockFile(filePath);

  if (ownerId) {
    const known = new Map<string, StoredRecord>([...Object.entries(current), ...memory.entries()]);
    if (activeCount(known.values(), ownerId, now) >= MAX_ACTIVE_SHARES_PER_OWNER) {
      throw new ShareLimitError();
    }
  }

  memory.set(id, record);
  while (memory.size > MAX_MOCK_SHARED_CHATS) {
    const oldest = memory.keys().next().value;
    if (!oldest) break;
    memory.delete(oldest);
  }

  current[id] = record;
  const keys = Object.keys(current);
  if (keys.length > MAX_MOCK_SHARED_CHATS) {
    for (const oldKey of keys.slice(0, keys.length - MAX_MOCK_SHARED_CHATS)) {
      delete current[oldKey];
    }
  }
  writeMockFile(filePath, current);

  return publicRecord(record);
}

/**
 * Recupera una conversación compartida por `shareId`, o `null` si no existe,
 * es inválido, fue revocada o venció.
 */
export async function getSharedChat(
  shareId: string,
  deps?: ShareStoreDeps,
): Promise<SharedChatRecord | null> {
  if (!isValidShareId(shareId)) return null;
  const mode = resolveMode(deps);
  const now = nowOf(deps);

  if (mode === "supabase") {
    const select = deps?.selectLive ?? selectSharedChatRow;
    const row = await select(shareId);
    if (!row) return null;
    // Defensa en profundidad: sin `expires_at` legible la fila no se muestra.
    const live = isLive(
      { createdAt: row.created_at, expiresAt: row.expires_at ?? "invalid", revokedAt: row.revoked_at },
      now,
    );
    if (!live) return null;
    const parsedMessages = z.array(sharedMessageSchema).safeParse(row.messages);
    if (!parsedMessages.success || parsedMessages.data.length === 0) return null;
    const title = sanitizeTitle(row.title);
    if (!title) return null;
    return {
      id: row.id,
      title,
      messages: parsedMessages.data,
      createdAt: row.created_at,
      expiresAt: row.expires_at ?? undefined,
      revokedAt: null,
    };
  }

  const memory = getMemoryStore();
  const inMemory = memory.get(shareId);
  if (inMemory) return isLive(inMemory, now) ? publicRecord(inMemory) : null;

  const filePath = deps?.mockFilePath ?? DEFAULT_MOCK_FILE;
  const fileData = readMockFile(filePath);
  const fromFile = fileData[shareId];
  if (!fromFile) return null;

  const parsed = createSharedChatSchema.safeParse({
    title: fromFile.title,
    messages: fromFile.messages,
  });
  if (!parsed.success) return null;

  const normalized: StoredRecord = {
    id: shareId,
    title: parsed.data.title,
    messages: parsed.data.messages,
    createdAt:
      typeof fromFile.createdAt === "string" ? fromFile.createdAt : new Date(now).toISOString(),
    expiresAt: typeof fromFile.expiresAt === "string" ? fromFile.expiresAt : undefined,
    revokedAt: typeof fromFile.revokedAt === "string" ? fromFile.revokedAt : null,
    ownerId: typeof fromFile.ownerId === "string" ? fromFile.ownerId : null,
  };
  if (!isLive(normalized, now)) return null;
  memory.set(shareId, normalized);
  return publicRecord(normalized);
}

/**
 * Revoca un enlace. Sólo funciona para el dueño; `false` si no existe, ya
 * estaba revocado o es de otra persona (misma respuesta: no filtra existencia).
 */
export async function revokeSharedChat(
  shareId: string,
  ownerId: string,
  deps?: ShareStoreDeps,
): Promise<boolean> {
  if (!isValidShareId(shareId) || !ownerId.trim()) return false;
  const mode = resolveMode(deps);

  if (mode === "supabase") {
    const owner = parseUuidOrNull(ownerId);
    if (!owner) return false;
    return (deps?.revokeLive ?? revokeSharedChatRow)(shareId, owner);
  }

  const owner = ownerId.trim();
  const now = new Date(nowOf(deps)).toISOString();
  let revoked = false;
  const memory = getMemoryStore();
  const inMemory = memory.get(shareId);
  if (inMemory && inMemory.ownerId === owner && !inMemory.revokedAt) {
    inMemory.revokedAt = now;
    revoked = true;
  }
  const filePath = deps?.mockFilePath ?? DEFAULT_MOCK_FILE;
  const fileData = readMockFile(filePath);
  const fromFile = fileData[shareId];
  if (fromFile && fromFile.ownerId === owner && !fromFile.revokedAt) {
    fromFile.revokedAt = now;
    writeMockFile(filePath, fileData);
    revoked = true;
  }
  return revoked;
}

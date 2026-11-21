import "server-only";

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { insertSharedChatRow, selectSharedChatRow } from "@/lib/services/ai-share.supabase";

export const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;
export const MAX_SHARED_MESSAGES = 40;
export const MAX_SHARED_TITLE_LENGTH = 160;
export const MAX_SHARED_TEXT_LENGTH = 12_000;
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
};

export type CreateSharedChatInput = {
  title: string;
  messages: readonly SharedChatMessage[];
  ownerId?: string | null;
};

type SupabaseSharedChatRow = {
  id: string;
  title: string;
  messages: unknown;
  created_at: string;
};

export type ShareStoreDeps = {
  dataMode?: () => string;
  insertLive?: (row: {
    id: string;
    owner_id: string | null;
    title: string;
    messages: SharedChatMessage[];
  }) => Promise<SupabaseSharedChatRow>;
  selectLive?: (id: string) => Promise<SupabaseSharedChatRow | null>;
  mockFilePath?: string;
};

const GLOBAL_STORE_KEY = "__maverlangSharedChats";
const DEFAULT_MOCK_FILE = path.join(os.tmpdir(), "maverlang-ai-shared-chats.json");

function getMemoryStore(): Map<string, SharedChatRecord> {
  const globalRecord = globalThis as typeof globalThis & {
    [GLOBAL_STORE_KEY]?: Map<string, SharedChatRecord>;
  };
  if (!globalRecord[GLOBAL_STORE_KEY]) {
    globalRecord[GLOBAL_STORE_KEY] = new Map<string, SharedChatRecord>();
  }
  return globalRecord[GLOBAL_STORE_KEY];
}

function readMockFile(filePath: string): Record<string, SharedChatRecord> {
  try {
    if (!existsSync(filePath)) return {};
    const raw = readFileSync(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, SharedChatRecord>;
  } catch {
    return {};
  }
}

function writeMockFile(filePath: string, data: Record<string, SharedChatRecord>): void {
  try {
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, JSON.stringify(data), "utf8");
  } catch {
    // En entornos de sólo lectura el respaldo en memoria sigue funcionando.
  }
}

function effectiveDataMode(deps?: ShareStoreDeps): "mock" | "live" {
  const raw = deps?.dataMode
    ? deps.dataMode()
    : (process.env.DATA_MODE ?? serverEnv.DATA_MODE ?? "mock");
  return raw.trim() === "live" ? "live" : "mock";
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

async function defaultInsertLive(row: {
  id: string;
  owner_id: string | null;
  title: string;
  messages: SharedChatMessage[];
}): Promise<SupabaseSharedChatRow> {
  return insertSharedChatRow(row);
}

async function defaultSelectLive(id: string): Promise<SupabaseSharedChatRow | null> {
  return selectSharedChatRow(id);
}

/**
 * Valida y persiste una conversación compartida de sólo lectura.
 * En `DATA_MODE=mock` guarda en memoria + archivo temporal; en `live` usa Supabase.
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
  const mode = effectiveDataMode(deps);

  if (mode === "live") {
    const insert = deps?.insertLive ?? defaultInsertLive;
    const inserted = await insert({
      id,
      owner_id: parseUuidOrNull(input.ownerId),
      title: validated.title,
      messages: validated.messages,
    });
    const parsedMessages = z.array(sharedMessageSchema).safeParse(inserted.messages);
    return {
      id: inserted.id,
      title: sanitizeTitle(inserted.title) || validated.title,
      messages: parsedMessages.success ? parsedMessages.data : validated.messages,
      createdAt: inserted.created_at,
    };
  }

  const record: SharedChatRecord = {
    id,
    title: validated.title,
    messages: validated.messages,
    createdAt: new Date().toISOString(),
  };

  const memory = getMemoryStore();
  memory.set(id, record);
  while (memory.size > MAX_MOCK_SHARED_CHATS) {
    const oldest = memory.keys().next().value;
    if (!oldest) break;
    memory.delete(oldest);
  }

  const filePath = deps?.mockFilePath ?? DEFAULT_MOCK_FILE;
  const current = readMockFile(filePath);
  current[id] = record;
  const keys = Object.keys(current);
  if (keys.length > MAX_MOCK_SHARED_CHATS) {
    for (const oldKey of keys.slice(0, keys.length - MAX_MOCK_SHARED_CHATS)) {
      delete current[oldKey];
    }
  }
  writeMockFile(filePath, current);

  return record;
}

/**
 * Recupera una conversación compartida por `shareId`, o `null` si no existe o es inválido.
 */
export async function getSharedChat(
  shareId: string,
  deps?: ShareStoreDeps,
): Promise<SharedChatRecord | null> {
  if (!isValidShareId(shareId)) return null;
  const mode = effectiveDataMode(deps);

  if (mode === "live") {
    const select = deps?.selectLive ?? defaultSelectLive;
    const row = await select(shareId);
    if (!row) return null;
    const parsedMessages = z.array(sharedMessageSchema).safeParse(row.messages);
    if (!parsedMessages.success || parsedMessages.data.length === 0) return null;
    const title = sanitizeTitle(row.title);
    if (!title) return null;
    return {
      id: row.id,
      title,
      messages: parsedMessages.data,
      createdAt: row.created_at,
    };
  }

  const memory = getMemoryStore();
  const inMemory = memory.get(shareId);
  if (inMemory) return inMemory;

  const filePath = deps?.mockFilePath ?? DEFAULT_MOCK_FILE;
  const fileData = readMockFile(filePath);
  const fromFile = fileData[shareId];
  if (!fromFile) return null;

  const parsed = createSharedChatSchema.safeParse({
    title: fromFile.title,
    messages: fromFile.messages,
  });
  if (!parsed.success) return null;

  const normalized: SharedChatRecord = {
    id: shareId,
    title: parsed.data.title,
    messages: parsed.data.messages,
    createdAt: typeof fromFile.createdAt === "string" ? fromFile.createdAt : new Date().toISOString(),
  };
  memory.set(shareId, normalized);
  return normalized;
}

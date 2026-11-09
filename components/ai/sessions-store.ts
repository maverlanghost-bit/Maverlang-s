import type { ChatMessage } from "@/components/ai/model";

/**
 * Historial de conversaciones del asistente.
 *
 * Este módulo no decide de quién es el historial: recibe un `scope` ya
 * resuelto por el llamador y deriva la clave de almacenamiento a partir de él,
 * de modo que dos identidades nunca comparten el mismo registro. Todo el
 * acceso a almacenamiento está encapsulado y nunca lanza.
 */

export type AiModelId = "fast" | "pro";

export type SavedChatItem = {
  id: string;
  title: string;
  updatedAt: number;
  pinned?: boolean;
  messages: ChatMessage[];
};

export type GroupedChats = {
  pinned: SavedChatItem[];
  today: SavedChatItem[];
  yesterday: SavedChatItem[];
  previous: SavedChatItem[];
};

export type AdvancedToolId =
  | "chart_bar"
  | "chart_line"
  | "chart_pie"
  | "chart_area"
  | "chart_radar"
  | "fin_metrics"
  | "stock_compare"
  | "sector_perf";

const MAX_CHATS = 60;
const MAX_MESSAGES_PER_CHAT = 40;
const STORAGE_KEY_SUFFIX = "sessions_v1";
const FALLBACK_TITLE = "Conversación";

type ChatWidget = NonNullable<ChatMessage["widgets"]>[number];
type NoticeKind = NonNullable<ChatMessage["notice"]>["kind"];

const NOTICE_KINDS: readonly NoticeKind[] = [
  "not_configured",
  "rate_limited",
  "bad_request",
  "upstream",
];

/** Lo mínimo que se usa del almacenamiento web; evita depender de `Storage`. */
interface ChatStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageKey(scope: string): string {
  return `${scope}:${STORAGE_KEY_SUFFIX}`;
}

/**
 * `sessionStorage` primero (por pestaña) y `localStorage` como respaldo.
 * Leer `window.sessionStorage` puede lanzar si el navegador bloquea el
 * almacenamiento, así que se resuelve dentro de try/catch.
 */
function pickStorage(kind: "session" | "local"): ChatStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function readRaw(key: string): string | null {
  const kinds = ["session", "local"] as const;
  for (const kind of kinds) {
    const storage = pickStorage(kind);
    if (!storage) continue;
    try {
      const value = storage.getItem(key);
      if (value !== null) return value;
    } catch {
      // Almacenamiento bloqueado: se intenta el siguiente.
    }
  }
  return null;
}

function writeRaw(key: string, value: string): void {
  const kinds = ["session", "local"] as const;
  for (const kind of kinds) {
    const storage = pickStorage(kind);
    if (!storage) continue;
    try {
      storage.setItem(key, value);
      return;
    } catch {
      // Cuota llena o almacenamiento bloqueado: se intenta el siguiente.
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNoticeKind(value: unknown): value is NoticeKind {
  return typeof value === "string" && NOTICE_KINDS.some((kind) => kind === value);
}

/**
 * Los widgets vienen del servidor ya tipados; al releerlos sólo se comprueba
 * la forma mínima para no perder los gráficos de un chat guardado.
 */
function sanitizeWidgets(value: unknown): ChatWidget[] | null {
  if (!Array.isArray(value)) return null;
  const widgets: ChatWidget[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.type !== "string") continue;
    widgets.push(item as ChatWidget);
  }
  return widgets.length > 0 ? widgets : null;
}

function sanitizeMessage(input: unknown): ChatMessage | null {
  if (!isRecord(input)) return null;

  const id = typeof input.id === "string" ? input.id.trim() : "";
  const role = input.role === "user" || input.role === "assistant" ? input.role : null;
  if (!id || !role) return null;

  const message: ChatMessage = {
    id,
    role,
    text: typeof input.text === "string" ? input.text : "",
  };

  const widgets = sanitizeWidgets(input.widgets);
  if (widgets) message.widgets = widgets;

  const image = input.imageDataUrl;
  if (
    typeof image === "string" &&
    (image.startsWith("data:image/jpeg") || image.startsWith("data:image/png"))
  ) {
    message.imageDataUrl = image;
  }

  const notice = isRecord(input.notice) ? input.notice : null;
  if (notice && isNoticeKind(notice.kind) && typeof notice.message === "string") {
    message.notice = { kind: notice.kind, message: notice.message };
  }

  return message;
}

function sanitizeMessages(input: readonly unknown[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const item of input) {
    const message = sanitizeMessage(item);
    if (message) messages.push(message);
  }
  return messages.slice(-MAX_MESSAGES_PER_CHAT);
}

function sanitizeChat(input: unknown, now: number): SavedChatItem | null {
  if (!isRecord(input)) return null;

  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) return null;

  const rawTitle = typeof input.title === "string" ? input.title.trim() : "";
  const updatedAt =
    typeof input.updatedAt === "number" && Number.isFinite(input.updatedAt) ? input.updatedAt : now;
  const messages = Array.isArray(input.messages) ? sanitizeMessages(input.messages) : [];

  return {
    id,
    title: rawTitle || FALLBACK_TITLE,
    updatedAt,
    pinned: input.pinned === true,
    messages,
  };
}

function normalizeChats(input: readonly unknown[], now: number): SavedChatItem[] {
  const chats: SavedChatItem[] = [];
  for (const item of input) {
    const chat = sanitizeChat(item, now);
    if (chat) chats.push(chat);
  }
  chats.sort((a, b) => b.updatedAt - a.updatedAt);

  const unique: SavedChatItem[] = [];
  const seen = new Set<string>();
  for (const chat of chats) {
    if (seen.has(chat.id)) continue;
    seen.add(chat.id);
    unique.push(chat);
    if (unique.length >= MAX_CHATS) break;
  }
  return unique;
}

/** Persiste y devuelve exactamente la lista que quedó guardada. */
function commit(scope: string, chats: readonly unknown[]): SavedChatItem[] {
  const persisted = normalizeChats(chats, Date.now());
  if (typeof window === "undefined") return persisted;
  try {
    writeRaw(storageKey(scope), JSON.stringify(persisted));
  } catch {
    // Nunca lanza: si el almacenamiento falla, la lista sigue en memoria.
  }
  return persisted;
}

export function readSavedChats(scope: string): SavedChatItem[] {
  if (typeof window === "undefined") return [];
  const raw = readRaw(storageKey(scope));
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return normalizeChats(parsed, Date.now());
}

export function writeSavedChats(scope: string, chats: SavedChatItem[]): void {
  if (typeof window === "undefined") return;
  try {
    writeRaw(storageKey(scope), JSON.stringify(normalizeChats(chats, Date.now())));
  } catch {
    // Cuota llena o contenido no serializable: no se persiste.
  }
}

export function upsertSavedChat(scope: string, chat: SavedChatItem): SavedChatItem[] {
  const current = readSavedChats(scope);
  const index = current.findIndex((item) => item.id === chat.id);

  if (index === -1) return commit(scope, [chat, ...current]);

  const existing = current[index];
  const next = [...current];
  next[index] = {
    ...chat,
    pinned: chat.pinned ?? existing.pinned ?? false,
    updatedAt: Date.now(),
  };
  return commit(scope, next);
}

export function renameSavedChat(scope: string, chatId: string, newTitle: string): SavedChatItem[] {
  const current = readSavedChats(scope);
  const title = newTitle.trim();
  if (!title) return current;
  return commit(
    scope,
    current.map((item) => (item.id === chatId ? { ...item, title } : item)),
  );
}

export function togglePinSavedChat(scope: string, chatId: string): SavedChatItem[] {
  const current = readSavedChats(scope);
  return commit(
    scope,
    current.map((item) =>
      item.id === chatId ? { ...item, pinned: item.pinned !== true } : item,
    ),
  );
}

export function deleteSavedChat(scope: string, chatId: string): SavedChatItem[] {
  const current = readSavedChats(scope);
  return commit(
    scope,
    current.filter((item) => item.id !== chatId),
  );
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesQuery(chat: SavedChatItem, needle: string): boolean {
  if (normalizeText(chat.title).includes(needle)) return true;
  return chat.messages.some((message) => normalizeText(message.text).includes(needle));
}

export function groupSavedChatsByDate(
  chats: readonly SavedChatItem[],
  query?: string,
): GroupedChats {
  const needle = normalizeText((query ?? "").trim());
  const reference = new Date(Date.now());
  const todayStart = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
  ).getTime();
  const yesterdayStart = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate() - 1,
  ).getTime();

  const groups: GroupedChats = { pinned: [], today: [], yesterday: [], previous: [] };
  const ordered = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  for (const chat of ordered) {
    if (needle && !matchesQuery(chat, needle)) continue;
    if (chat.pinned === true) {
      groups.pinned.push(chat);
    } else if (chat.updatedAt >= todayStart) {
      groups.today.push(chat);
    } else if (chat.updatedAt >= yesterdayStart) {
      groups.yesterday.push(chat);
    } else {
      groups.previous.push(chat);
    }
  }

  return groups;
}

export function exportChatToMarkdown(title: string, messages: readonly ChatMessage[]): string {
  const heading = `# ${title.trim() || FALLBACK_TITLE}`;
  const blocks: string[] = [];

  for (const message of messages) {
    const text = message.text.trim();
    if (!text) continue;
    const author = message.role === "user" ? "Tú" : "Maverlang IA";
    blocks.push(`### ${author}\n${text}`);
  }

  if (blocks.length === 0) return `${heading}\n`;
  return `${heading}\n\n${blocks.join("\n\n")}\n`;
}

import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AI_GUEST_SCOPE_KEY,
  AI_HISTORY_KEY,
  AI_HISTORY_SCOPE_PREFIX,
  chatIdentityFingerprint,
  publishChatSnapshot,
  readChatHistory,
  readChatSnapshot,
  resetChatSnapshot,
  resolveChatScope,
  writeChatHistory,
  type ChatMessage,
  type KeyValueStore,
} from "@/components/ai/model";

const ROOT = path.resolve(__dirname, "..", "..");
let sequence = 0;

function userId(label: string): string {
  sequence += 1;
  return `did:privy:test-${label}-${sequence}`;
}

function memory(): KeyValueStore & { keys: () => string[] } {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    keys: () => [...data.keys()],
  };
}

function message(id: string, text: string): ChatMessage {
  return { id, role: "user", text };
}

function accountScope(label: string) {
  const scope = resolveChatScope("authenticated", userId(label));
  if (!scope || scope.kind !== "account") throw new Error("se esperaba un scope de cuenta");
  return scope;
}

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

let store: ReturnType<typeof memory>;

beforeEach(() => {
  store = memory();
  vi.stubGlobal("window", { sessionStorage: store });
  // Fuerza el snapshot al scope sin identidad para que cada prueba parta limpia.
  readChatSnapshot(resolveChatScope("loading", null));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("aislamiento del chat IA por identidad", () => {
  it("loading no tiene scope; invitado es memoria; autenticado exige id", () => {
    expect(resolveChatScope("loading", "did:privy:a")).toBeNull();
    expect(resolveChatScope("authenticated", null)).toBeNull();
    expect(resolveChatScope("authenticated", "   ")).toBeNull();

    const guest = resolveChatScope("unauthenticated", null);
    expect(guest).toEqual({ kind: "guest", key: AI_GUEST_SCOPE_KEY, storageKey: null });

    const account = resolveChatScope("authenticated", "did:privy:a");
    expect(account?.kind).toBe("account");
    expect(account?.storageKey).toBe(account?.key);
    expect(account?.storageKey?.startsWith(`${AI_HISTORY_SCOPE_PREFIX}::u:`)).toBe(true);
  });

  it("la clave es estable por cuenta, distinta entre cuentas y no expone el id", () => {
    const a = userId("alice");
    const b = userId("bob");
    const first = resolveChatScope("authenticated", a);
    const again = resolveChatScope("authenticated", a);
    const other = resolveChatScope("authenticated", b);

    expect(first?.key).toBe(again?.key);
    expect(first?.key).not.toBe(other?.key);
    expect(first?.key).not.toContain(a);
    expect(first?.key).not.toContain("did:privy:");
    expect(chatIdentityFingerprint(a)).toMatch(/^[a-f0-9]{16}$/);
    expect(chatIdentityFingerprint(a)).not.toBe(chatIdentityFingerprint(b));
  });

  it("cada cuenta lee y escribe sólo su clave; la histórica queda intacta", () => {
    const a = accountScope("alice");
    const b = accountScope("bob");
    const legacy: ChatMessage = {
      ...message("legacy", "conversación sin dueño"),
      imageDataUrl: "data:image/png;base64,AAAA",
    };
    const fromA = message("a1", "pregunta de Alice");
    const fromB = message("b1", "pregunta de Bob");

    writeChatHistory(store, [legacy]);
    writeChatHistory(store, [fromA], a.storageKey);
    writeChatHistory(store, [fromB], b.storageKey);

    expect(readChatHistory(store, a.storageKey)).toEqual([fromA]);
    expect(readChatHistory(store, b.storageKey)).toEqual([fromB]);
    expect(readChatHistory(store, AI_HISTORY_KEY)).toEqual([legacy]);
    expect(store.keys()).toContain(AI_HISTORY_KEY);
    expect(readChatSnapshot(a)).toEqual([fromA]);
    expect(readChatSnapshot(a)).not.toContainEqual(legacy);
  });

  it("al cambiar de identidad vacía la memoria y no mezcla conversaciones", () => {
    const a = accountScope("alice");
    const b = accountScope("bob");
    const fromA = message("a1", "secreto de Alice");
    const fromB = message("b1", "secreto de Bob");
    const lateForA = message("a2", "respuesta tardía de Alice");

    writeChatHistory(store, [fromA], a.storageKey);
    writeChatHistory(store, [fromB], b.storageKey);

    expect(readChatSnapshot(a)).toEqual([fromA]);
    expect(readChatSnapshot(b)).toEqual([fromB]);
    expect(readChatSnapshot(a)).toEqual([fromA]);

    // Una respuesta que llega después del cambio no puede caer en la otra cuenta.
    readChatSnapshot(b);
    expect(publishChatSnapshot(a, [fromA, lateForA])).toBe(false);
    expect(readChatHistory(store, b.storageKey)).toEqual([fromB]);
    expect(readChatSnapshot(a)).toEqual([fromA]);
  });

  it("la sesión sin autenticar usa memoria y no escribe en sessionStorage", () => {
    const guest = resolveChatScope("unauthenticated", null)!;
    const question: ChatMessage = {
      ...message("g1", "pregunta de invitado"),
      imageDataUrl: "data:image/png;base64,AAAA",
    };

    expect(readChatSnapshot(guest)).toEqual([]);
    expect(publishChatSnapshot(guest, [question])).toBe(true);
    expect(readChatSnapshot(guest)).toEqual([question]);
    expect(store.keys()).toEqual([]);
  });

  it("reentrada del mismo usuario recupera su conversación guardada", () => {
    const a = accountScope("alice");
    const guest = resolveChatScope("unauthenticated", null)!;
    const question = message("a1", "mi pregunta anterior");

    writeChatHistory(store, [question], a.storageKey);
    expect(readChatSnapshot(a)).toEqual([question]);
    expect(readChatSnapshot(guest)).toEqual([]);
    expect(readChatSnapshot(a)).toEqual([question]);
  });

  it("Nuevo chat borra sólo la identidad activa y nunca la histórica", () => {
    const a = accountScope("alice");
    const b = accountScope("bob");
    const legacy = message("legacy", "histórico sin atribuir");
    const fromA = message("a1", "Alice");
    const fromB = message("b1", "Bob");

    writeChatHistory(store, [legacy]);
    writeChatHistory(store, [fromA], a.storageKey);
    writeChatHistory(store, [fromB], b.storageKey);
    readChatSnapshot(a);

    resetChatSnapshot(a);

    expect(readChatHistory(store, a.storageKey)).toEqual([]);
    expect(readChatHistory(store, b.storageKey)).toEqual([fromB]);
    expect(readChatHistory(store, AI_HISTORY_KEY)).toEqual([legacy]);
    expect(readChatSnapshot(a)).toEqual([]);
    expect(readChatSnapshot(b)).toEqual([fromB]);
  });

  it("la pantalla y la sidebar usan el scope resuelto y no la clave histórica", () => {
    const screen = read("app/(platform)/app/asistente/asistente-screen.tsx");
    const sidebar = read("components/app-shell/sidebar.tsx");

    expect(screen).toContain("useSession");
    expect(screen).toContain("resolveChatScope");
    expect(screen).toContain("readChatSnapshot");
    expect(screen).toContain("publishChatSnapshot");
    expect(screen).toContain("resetChatSnapshot");
    expect(screen).toContain("epoch");
    expect(screen).not.toContain("AI_HISTORY_KEY");

    expect(sidebar).toContain("useSession");
    expect(sidebar).toContain("resolveChatScope");
    expect(sidebar).toContain("readChatSnapshot");
    expect(sidebar).not.toContain("mv_ai_chat_v1");
    expect(sidebar).not.toContain("AI_HISTORY_KEY");
  });
});

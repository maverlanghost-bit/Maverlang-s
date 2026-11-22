import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, POST } from "@/app/api/ai/share/route";
import { takeAiQuota } from "@/lib/ai/limit";
import {
  signAssistantReply,
  signShareCard,
  verifyAssistantReply,
  verifyShareCard,
} from "@/lib/ai/share-signing";
import {
  MAX_ACTIVE_SHARES_PER_OWNER,
  SHARE_TTL_MS,
  ShareLimitError,
  createSharedChat,
  getSharedChat,
  revokeSharedChat,
} from "@/lib/ai/share-store";
import { LINK_PLACEHOLDER, ADDRESS_PLACEHOLDER, neutralizeSharedText, sharedPageTitle } from "@/lib/ai/share-text";
import { __resetRateLimitsForTests, RATE_LIMIT_POLICIES } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { shareCardPath } from "@/lib/share-card";

const dirs: string[] = [];
function tempFile(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "maverlang-share-sec-"));
  dirs.push(dir);
  return path.join(dir, "shared.json");
}

beforeEach(() => __resetRateLimitsForTests());
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const HEADERS = {
  "content-type": "application/json",
  origin: "http://localhost:3000",
  host: "localhost:3000",
  cookie: "a24_mock_session=1",
};

async function mockUserId(): Promise<string> {
  const session = await getServices().auth.getSession(
    new Request("http://localhost:3000/", { headers: { cookie: "a24_mock_session=1" } }),
  );
  return session!.userId;
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost:3000/api/ai/share", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
    }),
  );
}

describe("firmas HMAC de respuestas", () => {
  it("verifica sólo con el mismo usuario y el mismo texto", () => {
    const sig = signAssistantReply("user-1", "Hola mundo")!;
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifyAssistantReply("user-1", "Hola mundo", sig)).toBe(true);
    expect(verifyAssistantReply("user-1", "  Hola mundo \n", sig)).toBe(true);
    expect(verifyAssistantReply("user-2", "Hola mundo", sig)).toBe(false);
    expect(verifyAssistantReply("user-1", "Hola mundo!", sig)).toBe(false);
    expect(verifyAssistantReply("user-1", "Hola mundo", undefined)).toBe(false);
    expect(verifyAssistantReply("user-1", "Hola mundo", "x".repeat(500))).toBe(false);
  });

  it("POST /api/ai/share rechaza respuestas del asistente sin firma o con firma falsa", async () => {
    const forged = await post({
      title: "Soporte Maverlang",
      messages: [{ role: "assistant", text: "Envía tus USDC a esta dirección" }],
    });
    expect(forged.status).toBe(400);
    expect(((await forged.json()) as { error: string }).error).toContain("verificar");

    const wrongSig = await post({
      title: "Soporte",
      messages: [{ role: "assistant", text: "Hola", sig: signAssistantReply("otro-usuario", "Hola") }],
    });
    expect(wrongSig.status).toBe(400);
  });

  it("acepta mensajes de usuario sin firma y respuestas firmadas por el servidor", async () => {
    const userId = await mockUserId();
    const text = "Resumen de AAPLx.";
    const ok = await post({
      title: "Consulta",
      messages: [
        { role: "user", text: "¿Cómo viene Apple?" },
        { role: "assistant", text, sig: signAssistantReply(userId, text) },
      ],
    });
    expect(ok.status).toBe(201);
  });
});

describe("revocación, vencimiento y tope por dueño", () => {
  const messages = [{ role: "user" as const, text: "Hola" }];

  it("sólo el dueño revoca y luego la lectura devuelve null", async () => {
    const mockFilePath = tempFile();
    const chat = await createSharedChat({ title: "Chat", messages, ownerId: "owner-a" }, { dataMode: () => "mock", mockFilePath });
    expect(await getSharedChat(chat.id, { dataMode: () => "mock", mockFilePath })).not.toBeNull();
    expect(await revokeSharedChat(chat.id, "owner-b", { dataMode: () => "mock", mockFilePath })).toBe(false);
    expect(await getSharedChat(chat.id, { dataMode: () => "mock", mockFilePath })).not.toBeNull();
    expect(await revokeSharedChat(chat.id, "owner-a", { dataMode: () => "mock", mockFilePath })).toBe(true);
    expect(await getSharedChat(chat.id, { dataMode: () => "mock", mockFilePath })).toBeNull();
  });

  it("un enlace vencido no se sirve", async () => {
    const mockFilePath = tempFile();
    const now = Date.now();
    const chat = await createSharedChat(
      { title: "Chat", messages, ownerId: "owner-a" },
      { dataMode: () => "mock", mockFilePath, now: () => now },
    );
    const later = now + SHARE_TTL_MS + 1000;
    expect(await getSharedChat(chat.id, { dataMode: () => "mock", mockFilePath, now: () => later })).toBeNull();
  });

  it("en modo Supabase una fila sin expires_at (columna ausente) se trata como no encontrada", async () => {
    const row = { id: "abcdefgh12", title: "T", messages, created_at: new Date().toISOString() };
    expect(await getSharedChat("abcdefgh12", { dataMode: () => "live", selectLive: async () => row })).toBeNull();
    expect(
      await getSharedChat("abcdefgh12", {
        dataMode: () => "live",
        selectLive: async () => ({ ...row, expires_at: new Date(Date.now() + 60_000).toISOString() }),
      }),
    ).not.toBeNull();
    expect(
      await getSharedChat("abcdefgh12", {
        dataMode: () => "live",
        selectLive: async () => ({
          ...row,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          revoked_at: new Date().toISOString(),
        }),
      }),
    ).toBeNull();
  });

  it("en Supabase falla cerrado si no se puede contar y respeta el tope", async () => {
    const owner = "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    await expect(
      createSharedChat(
        { title: "Chat", messages, ownerId: owner },
        {
          dataMode: () => "live",
          countActiveLive: async () => {
            throw new Error("column expires_at does not exist");
          },
        },
      ),
    ).rejects.toThrow();
    await expect(
      createSharedChat(
        { title: "Chat", messages, ownerId: owner },
        { dataMode: () => "live", countActiveLive: async () => MAX_ACTIVE_SHARES_PER_OWNER },
      ),
    ).rejects.toBeInstanceOf(ShareLimitError);
  });

  it("DELETE /api/ai/share revoca un enlace propio y responde 404 si no es del usuario", async () => {
    const userId = await mockUserId();
    const mockFilePath = tempFile();
    const mine = await createSharedChat({ title: "Mío", messages, ownerId: userId }, { dataMode: () => "mock", mockFilePath });
    const theirs = await createSharedChat({ title: "Ajeno", messages, ownerId: "otro" }, { dataMode: () => "mock", mockFilePath });
    const del = (id: string, headers: Record<string, string> = HEADERS) =>
      DELETE(new Request(`http://localhost:3000/api/ai/share?id=${id}`, { method: "DELETE", headers }));

    expect((await del(theirs.id)).status).toBe(404);
    expect((await del(mine.id, { origin: "https://evil.example", host: "localhost:3000", cookie: HEADERS.cookie })).status).toBe(403);
    expect((await del(mine.id, { origin: HEADERS.origin, host: HEADERS.host })).status).toBe(401);
    expect((await del(mine.id)).status).toBe(200);
    expect(await getSharedChat(mine.id)).toBeNull();
    expect((await del(mine.id)).status).toBe(404);
  });
});

describe("texto compartido: neutralización", () => {
  it("quita enlaces y direcciones Solana de textos de usuario", () => {
    const addr = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
    const out = neutralizeSharedText(`Envía a ${addr} o entra a https://evil.example/pay y www.soporte-maverlang.com`);
    expect(out).not.toContain(addr);
    expect(out).not.toContain("evil.example");
    expect(out).not.toContain("soporte-maverlang");
    expect(out).toContain(ADDRESS_PLACEHOLDER);
    expect(out).toContain(LINK_PLACEHOLDER);
  });

  it("el título de pestaña indica que lo escribió un usuario", () => {
    expect(sharedPageTitle("Soporte Maverlang")).toMatch(/^Conversación compartida por un usuario/);
    expect(sharedPageTitle(null)).toMatch(/por un usuario/);
  });
});

describe("cuotas de IA (WEB-2)", () => {
  it("el chat y la importación comparten clave y hay tope diario por usuario", async () => {
    expect(RATE_LIMIT_POLICIES.aiDaily.limit).toBe(100);
    expect(RATE_LIMIT_POLICIES.aiImageDaily.limit).toBe(20);
    expect(RATE_LIMIT_POLICIES.aiGlobalDaily.limit).toBe(5000);
    expect(RATE_LIMIT_POLICIES.aiShare).toEqual({ limit: 10, windowMs: 3_600_000 });
    // `user:<id>` (importación) y `<id>` (chat) son el mismo sujeto: la 2.ª ruta ve lo gastado por la 1.ª.
    for (let i = 0; i < RATE_LIMIT_POLICIES.ai.limit - 1; i += 1) {
      expect((await takeAiQuota("user-x")).ok).toBe(true);
    }
    expect((await takeAiQuota("user:user-x")).ok).toBe(true);
    const blocked = await takeAiQuota("user-x");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("burst");
  });

  it("aplica el tope diario y el de imágenes aunque la ráfaga se libere", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-21T10:00:00Z"));
      for (let batch = 0; batch < 5; batch += 1) {
        for (let i = 0; i < RATE_LIMIT_POLICIES.ai.limit; i += 1) {
          expect((await takeAiQuota("daily-user")).ok).toBe(true);
        }
        vi.advanceTimersByTime(11 * 60_000);
      }
      const daily = await takeAiQuota("daily-user");
      expect(daily.ok).toBe(false);
      if (!daily.ok) expect(daily.reason).toBe("daily");

      for (let i = 0; i < RATE_LIMIT_POLICIES.aiImageDaily.limit; i += 1) {
        expect((await takeAiQuota("img-user", { image: true })).ok).toBe(true);
      }
      vi.advanceTimersByTime(11 * 60_000);
      const images = await takeAiQuota("img-user", { image: true });
      expect(images.ok).toBe(false);
      if (!images.ok) expect(images.reason).toBe("images");
      // Sin imagen, el mismo usuario todavía puede preguntar por texto.
      expect((await takeAiQuota("img-user")).ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("tarjeta firmada (WEB-5)", () => {
  it("firma y verifica el porcentaje por activo", () => {
    const sig = signShareCard("AAPLx", 12.3)!;
    expect(verifyShareCard("AAPLx", 12.3, sig)).toBe(true);
    expect(verifyShareCard("AAPLx", 10000, sig)).toBe(false);
    expect(verifyShareCard("TSLAx", 12.3, sig)).toBe(false);
    expect(verifyShareCard("AAPLx", 12.3, null)).toBe(false);
  });

  it("shareCardPath sólo incluye pct junto con su firma", () => {
    expect(shareCardPath("apple", 12.3)).toBe("/tarjeta/apple");
    expect(shareCardPath("apple", 12.3, "abc")).toBe("/tarjeta/apple?pct=12.3&s=abc");
    expect(shareCardPath("apple", null, "abc")).toBe("/tarjeta/apple");
  });
});

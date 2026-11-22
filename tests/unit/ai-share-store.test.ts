import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ href, children, ...props }: { href: string; children?: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));

import {
  MAX_SHARED_MESSAGES,
  SHARE_ID_PATTERN,
  createSharedChat,
  generateShareId,
  getSharedChat,
  isValidShareId,
} from "@/lib/ai/share-store";
import { GET, POST } from "@/app/api/ai/share/route";
import { signAssistantReply } from "@/lib/ai/share-signing";
import { getServices } from "@/lib/services";
import SharedChatPage from "@/app/(platform)/app/asistente/compartido/[shareId]/page";

const tempDirs: string[] = [];

function tempMockFile(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "maverlang-share-test-"));
  tempDirs.push(dir);
  return path.join(dir, "shared.json");
}

afterEach(() => {
  notFoundMock.mockClear();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("ai-share-store — IDs y validación", () => {
  it("generateShareId produce IDs URL-safe válidos", () => {
    for (let i = 0; i < 10; i++) {
      const id = generateShareId();
      expect(SHARE_ID_PATTERN.test(id)).toBe(true);
      expect(isValidShareId(id)).toBe(true);
    }
  });

  it("isValidShareId rechaza IDs inseguros o fuera de rango", () => {
    expect(isValidShareId("")).toBe(false);
    expect(isValidShareId("abc1234")).toBe(false); // 7 chars
    expect(isValidShareId("a".repeat(33))).toBe(false);
    expect(isValidShareId("../etc")).toBe(false);
    expect(isValidShareId("abc/1234")).toBe(false);
    expect(isValidShareId(null)).toBe(false);
  });
});

describe("ai-share-store — mock mode y sanitización", () => {
  it("crea y recupera un chat sanitizando control chars y limitando a 40 mensajes", async () => {
    const mockFilePath = tempMockFile();
    const manyMessages = Array.from({ length: MAX_SHARED_MESSAGES + 5 }, (_, idx) => ({
      role: (idx % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      text: `Mensaje ${idx}\u0000`,
    }));

    const created = await createSharedChat(
      {
        title: "Análisis\nNVDAx\u0007",
        messages: manyMessages,
      },
      { dataMode: () => "mock", mockFilePath },
    );

    expect(isValidShareId(created.id)).toBe(true);
    expect(created.title).toBe("Análisis NVDAx");
    expect(created.messages).toHaveLength(MAX_SHARED_MESSAGES);
    expect(created.messages[0]?.text).toBe("Mensaje 0");

    const fetched = await getSharedChat(created.id, {
      dataMode: () => "mock",
      mockFilePath,
    });
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.title).toBe("Análisis NVDAx");
    expect(fetched?.messages).toHaveLength(MAX_SHARED_MESSAGES);
  });

  it("rechaza título vacío o lista de mensajes vacía", async () => {
    const mockFilePath = tempMockFile();
    await expect(
      createSharedChat(
        { title: "   ", messages: [{ role: "user", text: "Hola" }] },
        { dataMode: () => "mock", mockFilePath },
      ),
    ).rejects.toThrow();

    await expect(
      createSharedChat(
        { title: "Chat", messages: [] },
        { dataMode: () => "mock", mockFilePath },
      ),
    ).rejects.toThrow();
  });
});

describe("ai-share-store — live mode", () => {
  it("usa insertLive y selectLive cuando DATA_MODE=live", async () => {
    const stored = new Map<string, { id: string; title: string; messages: unknown; created_at: string }>();

    const created = await createSharedChat(
      {
        title: "Consulta AAPLx",
        ownerId: "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
        messages: [
          { role: "user", text: "¿Cómo viene Apple?" },
          { role: "assistant", text: "Resumen de AAPLx." },
        ],
      },
      {
        dataMode: () => "live",
        countActiveLive: async () => 0,
        insertLive: async (row) => {
          expect(row.owner_id).toBe("3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d");
          const saved = {
            id: row.id,
            title: row.title,
            messages: row.messages,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          };
          stored.set(row.id, saved);
          return saved;
        },
      },
    );

    const fetched = await getSharedChat(created.id, {
      dataMode: () => "live",
      selectLive: async (id) => stored.get(id) ?? null,
    });

    expect(fetched?.title).toBe("Consulta AAPLx");
    expect(fetched?.messages).toHaveLength(2);
  });
});

describe("API /api/ai/share y página compartida", () => {
  it("POST exige sesión (401 sin cookie); con sesión crea enlace y GET sigue público de solo lectura", async () => {
    const unauthRes = await POST(
      new Request("http://localhost:3000/api/ai/share", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
        body: JSON.stringify({
          title: "Portafolio Tech",
          messages: [{ role: "user", text: "Hola" }],
        }),
      }),
    );
    expect(unauthRes.status).toBe(401);

    const mockSession = await getServices().auth.getSession(
      new Request("http://localhost:3000/", { headers: { cookie: "a24_mock_session=1" } }),
    );
    const replyText = "Tu exposición en TSLAx es moderada.";
    const replySig = signAssistantReply(mockSession!.userId, replyText);
    const postReq = new Request("http://localhost:3000/api/ai/share", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        host: "localhost:3000",
        cookie: "a24_mock_session=1",
      },
      body: JSON.stringify({
        title: "Portafolio Tech",
        messages: [
          { role: "user", text: "Resume mi exposición en TSLAx" },
          { role: "assistant", text: replyText, sig: replySig },
        ],
      }),
    });

    const postRes = await POST(postReq);
    expect(postRes.status).toBe(201);
    const postBody = (await postRes.json()) as { id: string; url: string };
    expect(isValidShareId(postBody.id)).toBe(true);
    expect(postBody.url).toBe(`/app/asistente/compartido/${postBody.id}`);

    const getRes = await GET(new Request(`http://localhost:3000/api/ai/share?id=${postBody.id}`));
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { chat: { id: string; title: string } };
    expect(getBody.chat.id).toBe(postBody.id);
    expect(getBody.chat.title).toBe("Portafolio Tech");

    const notFoundRes = await GET(new Request("http://localhost:3000/api/ai/share?id=no-existe-123"));
    expect(notFoundRes.status).toBe(404);

    const element = await SharedChatPage({
      params: Promise.resolve({ shareId: postBody.id }),
    });
    const html = renderToStaticMarkup(element as React.ReactElement);
    expect(html).toContain("Conversación compartida · Solo lectura");
    expect(html).toContain("Conversación compartida por un usuario. No es una comunicación oficial de Maverlang.");
    expect(html).toContain("Portafolio Tech");
    expect(html).toContain("/app/asistente");

    await expect(
      SharedChatPage({ params: Promise.resolve({ shareId: "bad" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });
});

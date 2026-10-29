import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/ai/chat/route";
import { symbolSchema } from "@/lib/api/contracts";
import { __clearAssetsCacheForTests } from "@/lib/catalog/assets";
import { aiMessages } from "@/content/i18n/extra-b";
import { takeAiQuota } from "@/lib/ai/limit";
import { resolveTicker, scoreAsset, searchTickers } from "@/lib/ai/resolve";
import { MAX_TOOL_ROUNDS, runChat, withDisclaimer } from "@/lib/ai/run-chat";
import { AI_MAX_IMAGE_CHARS, aiChatRequestSchema, isAiImageDataUrl } from "@/lib/ai/schema";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { buyHref, executeToolCall, toWeightPcts, type AssistantDeps } from "@/lib/ai/tools";
import { priceHistory, quoteFor } from "@/lib/mocks/prices";
import { RATE_LIMIT_POLICIES, __resetRateLimitsForTests } from "@/lib/security/rate-limit";
import type { Range } from "@/lib/types";

const KEY = "unit-test-ai-key";
const copy = aiMessages.esCL;
const ROOT = path.resolve(__dirname, "..", "..");
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function failFetch(): Promise<Response> {
  return Promise.resolve(new Response("no", { status: 500 }));
}

function deps(load: AssistantDeps["loadPortfolio"]): AssistantDeps {
  return {
    prices: {
      async list(symbols) {
        return symbols.map((symbol) => quoteFor(symbol));
      },
      async history(symbol, range: Range) {
        return priceHistory(symbol, range, Date.UTC(2026, 0, 15));
      },
    },
    loadPortfolio: load,
    resolveTicker: (query) => resolveTicker(query, { fetchImpl: failFetch }),
    searchTickers: (query) => searchTickers(query, { fetchImpl: failFetch }),
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://maverlang.test/api/ai/chat", {
    method: "POST",
    headers: {
      origin: "https://maverlang.test",
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  __clearAssetsCacheForTests();
  __resetRateLimitsForTests();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  __clearAssetsCacheForTests();
  __resetRateLimitsForTests();
});

describe("asistente: catálogo y textos", () => {
  it("tesla y TSLA resuelven a TSLAx, dentro del catálogo visible", async () => {
    const tesla = await resolveTicker("tesla", { fetchImpl: failFetch });
    const tsla = await resolveTicker("TSLA", { fetchImpl: failFetch });
    const apple = await resolveTicker("apple", { fetchImpl: failFetch });
    const missing = await resolveTicker("zzzznoexiste", { fetchImpl: failFetch });
    expect(tesla?.ticker).toBe("TSLAx");
    expect(tesla?.name).toBe("Tesla");
    expect(tsla?.ticker).toBe("TSLAx");
    expect(apple?.ticker).toBe("AAPLx");
    expect(missing).toBeNull();
    expect(scoreAsset({ symbol: "TSLAx", underlying: "TSLA", name: "Tesla" }, "tesla")).toBeGreaterThanOrEqual(600);
  });

  it("el aviso va al final de una respuesta sobre acciones y no se duplica", () => {
    expect(withDisclaimer("Hola.", false)).toBe("Hola.");
    expect(withDisclaimer("Tesla cotiza.", true).endsWith(copy.disclaimer)).toBe(true);
    expect(withDisclaimer(`Dato.\n\n${copy.disclaimer}`, true).match(/recomendación de inversión/g)?.length).toBe(1);
    const prompt = buildSystemPrompt({ ticker: "TSLAx", name: "Tesla" });
    expect(prompt.includes("TSLAx")).toBe(true);
    expect(prompt.toLowerCase().includes("no es asesoría financiera")).toBe(true);
    expect(prompt.includes(copy.disclaimer)).toBe(true);
    expect(MAX_TOOL_ROUNDS).toBe(4);
  });

  it("el peso de la cartera acepta ratio o puntos", () => {
    expect(toWeightPcts([0.25, 0.75])).toEqual([25, 75]);
    expect(toWeightPcts([25, 75])).toEqual([25, 75]);
    expect(buyHref("TSLAx")).toBe("/app/accion/TSLAx?operar=comprar");
    expect(buyHref("BRK.Bx")).toBe("/app/accion/BRK.Bx?operar=comprar");
  });
});

describe("asistente: herramientas", () => {
  it("get_stock arma el widget con el precio del servicio y no ejecuta órdenes", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response("no", { status: 500 });
    });
    const result = await executeToolCall(
      "get_stock",
      JSON.stringify({ query: "tesla", range: "1D" }),
      new Request("https://maverlang.test/api/ai/chat"),
      deps(async () => ({ kind: "sign-in" })),
    );
    expect(result.widgets[0]).toMatchObject({
      type: "stock",
      ticker: "TSLAx",
      name: "Tesla",
      priceUsd: 248.9,
      range: "1D",
    });
    const stock = result.widgets[0];
    expect(stock && stock.type === "stock" && stock.points.length > 2).toBe(true);
    expect(stock && stock.type === "stock" && stock.points[stock.points.length - 1]?.p).toBe(248.9);
    expect(urls.some((url) => url.includes("/api/trade") || url.includes("api.x.ai"))).toBe(false);
    const source = readFileSync(path.join(ROOT, "lib", "ai", "tools.ts"), "utf8");
    expect(source.includes("trade.live")).toBe(false);
    expect(source.includes("trade.mock")).toBe(false);
    expect(source.includes(".submit(")).toBe(false);
  });

  it("compare, cartera sin sesión y el enlace de la ficha", async () => {
    const tools = deps(async () => ({ kind: "sign-in" }));
    const compare = await executeToolCall(
      "compare_stocks",
      JSON.stringify({ tickers: ["apple", "nvidia"], range: "1M" }),
      new Request("https://maverlang.test/api/ai/chat"),
      tools,
    );
    const widget = compare.widgets[0];
    expect(widget && widget.type === "compare" && widget.range).toBe("1M");
    expect(widget && widget.type === "compare" && widget.items.map((item) => item.ticker)).toEqual(["AAPLx", "NVDAx"]);

    const portfolio = await executeToolCall("get_portfolio", "{}", new Request("https://maverlang.test/api/ai/chat"), tools);
    expect(portfolio.widgets).toEqual([]);
    expect(portfolio.content).toBe(copy.signIn);
    expect(portfolio.stockRelated).toBe(false);

    const buy = await executeToolCall(
      "open_buy",
      JSON.stringify({ query: "tesla" }),
      new Request("https://maverlang.test/api/ai/chat"),
      tools,
    );
    expect(buy.widgets[0]).toEqual({
      type: "buy",
      ticker: "TSLAx",
      name: "Tesla",
      href: "/app/accion/TSLAx?operar=comprar",
    });
    expect(buy.content.includes("No se ejecutó ninguna orden.")).toBe(true);
  });

  it("la cartera con sesión no inventa el total y normaliza el peso", async () => {
    const result = await executeToolCall(
      "get_portfolio",
      "{}",
      new Request("https://maverlang.test/api/ai/chat"),
      deps(async () => ({
        kind: "ok",
        portfolio: {
          address: "demo",
          totalUsd: 1000,
          cashUsdc: 200,
          positions: [
            {
              symbol: "TSLAx",
              shares: 1,
              multiplier: 1,
              avgCostUsd: 200,
              priceUsd: 248.9,
              valueUsd: 250,
              pnlUsd: 50,
              pnlPct: 0.2,
              allocationPct: 0.25,
            },
          ],
          pnlUsd: 10,
          pnlPct: 0.01,
          updatedAt: "2026-01-15T00:00:00.000Z",
        },
      })),
    );
    expect(result.widgets[0]).toMatchObject({
      type: "portfolio",
      totalUsd: 1000,
      pnlPct: 0.01,
      positions: [{ ticker: "TSLAx", name: "Tesla", valueUsd: 250, weightPct: 25 }],
    });
  });

  it("el bucle corta a las 4 rondas y cierra con el aviso", async () => {
    vi.stubEnv("XAI_API_KEY", KEY);
    vi.stubEnv("XAI_MODEL", "");
    const rounds: boolean[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("api.x.ai")) return new Response("no", { status: 500 });
      const body = JSON.parse(String(init?.body)) as { tools?: unknown };
      const withTools = Array.isArray(body.tools) && body.tools.length > 0;
      rounds.push(withTools);
      if (withTools) {
        return Response.json({
          choices: [
            {
              message: {
                role: "assistant",
                content: "",
                tool_calls: [
                  {
                    id: `call_${rounds.length}`,
                    type: "function",
                    function: { name: "get_stock", arguments: JSON.stringify({ query: "tesla", range: "1W" }) },
                  },
                ],
              },
            },
          ],
        });
      }
      return Response.json({
        choices: [{ message: { role: "assistant", content: "Tesla está en el catálogo." } }],
      });
    });
    const result = await runChat(
      {
        messages: [{ role: "user", content: "cómo viene tesla" }],
        req: new Request("https://maverlang.test/api/ai/chat"),
      },
      deps(async () => ({ kind: "sign-in" })),
    );
    expect(rounds).toEqual([true, true, true, true, false]);
    expect(result.widgets).toHaveLength(1);
    expect(result.widgets[0]).toMatchObject({ type: "stock", ticker: "TSLAx", range: "1W" });
    expect(result.text.endsWith(copy.disclaimer)).toBe(true);
    expect(result.text.includes("Tesla está en el catálogo.")).toBe(true);
  });
});

describe("asistente: contrato HTTP", () => {
  const schema = aiChatRequestSchema(symbolSchema.max(16));

  it("valida el cuerpo y la imagen", () => {
    expect(schema.safeParse({ messages: [{ role: "user", content: "Hola" }] }).success).toBe(true);
    expect(schema.safeParse({ messages: [{ role: "user", content: "Hola" }], evil: "SECRETO-XYZ" }).success).toBe(false);
    expect(schema.safeParse({ messages: [{ role: "assistant", content: "Hola" }] }).success).toBe(false);
    expect(isAiImageDataUrl(PNG)).toBe(true);
    expect(isAiImageDataUrl(PNG.replace("image/png", "image/gif"))).toBe(false);
    expect(isAiImageDataUrl("a".repeat(AI_MAX_IMAGE_CHARS + 1))).toBe(false);
    const route = readFileSync(path.join(ROOT, "app", "api", "ai", "chat", "route.ts"), "utf8");
    expect(route.includes("parseJson")).toBe(true);
    expect(route.includes("assertSameOrigin")).toBe(true);
    expect(route.includes("lib/api/contracts")).toBe(true);
    expect(route.includes("Schema")).toBe(true);
    expect(RATE_LIMIT_POLICIES.ai).toEqual({ limit: 20, windowMs: 600_000 });
  });

  it("sin clave responde not_configured y no llama a xAI", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response("no", { status: 500 });
    });
    const response = await POST(post({ messages: [{ role: "user", content: "Hola" }] }));
    const json = (await response.json()) as { ok: boolean; error?: string; message?: string };
    expect(response.status).toBe(503);
    expect(json).toEqual({ ok: false, error: "not_configured", message: copy.notConfigured });
    expect(urls.some((url) => url.includes("api.x.ai"))).toBe(false);
  });

  it("rechaza origen ajeno, JSON inválido y un campo extra sin eco", async () => {
    vi.stubEnv("XAI_API_KEY", KEY);
    const alien = new Request("https://maverlang.test/api/ai/chat", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hola" }] }),
    });
    const origin = await POST(alien);
    expect(origin.status).toBe(403);
    expect(await origin.json()).toEqual({ ok: false, error: "bad_request", message: copy.badOrigin });

    const broken = await POST(post("{no"));
    expect(broken.status).toBe(400);
    expect(await broken.json()).toMatchObject({ ok: false, error: "bad_request" });

    const extra = await POST(post({ messages: [{ role: "user", content: "Hola" }], evil: "SECRETO-XYZ" }));
    const extraJson = await extra.json();
    expect(extra.status).toBe(400);
    expect(JSON.stringify(extraJson).includes("SECRETO-XYZ")).toBe(false);

    const gif = await POST(post({ messages: [{ role: "user", content: "Hola" }], image: "data:image/gif;base64,AAAA" }));
    expect(gif.status).toBe(400);
  });

  it("a la solicitud 21 responde 429 y, si pasa, devuelve el texto", async () => {
    vi.stubEnv("XAI_API_KEY", KEY);
    vi.stubEnv("XAI_MODEL", "");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      if (!String(input).includes("api.x.ai")) return new Response("no", { status: 500 });
      return Response.json({
        choices: [{ message: { role: "assistant", content: "Hola, ¿qué dato revisamos?" } }],
      });
    });
    const ip = "203.0.113.44";
    for (let index = 0; index < RATE_LIMIT_POLICIES.ai.limit; index += 1) {
      const slot = await takeAiQuota(ip);
      expect(slot.ok).toBe(true);
    }
    const limited = await POST(
      post({ messages: [{ role: "user", content: "Hola" }] }, { "x-forwarded-for": ip }),
    );
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ ok: false, error: "rate_limited", message: copy.rateLimited });
    expect(limited.headers.get("Retry-After")).toBeTruthy();

    __resetRateLimitsForTests();
    const ok = await POST(post({ messages: [{ role: "user", content: "Hola" }] }, { "x-forwarded-for": "203.0.113.45" }));
    const body = (await ok.json()) as { ok: boolean; text: string; widgets: unknown[] };
    expect(ok.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.text.includes("¿qué dato revisamos?")).toBe(true);
    expect(body.widgets).toEqual([]);
    expect(body.text.includes(copy.disclaimer)).toBe(false);
  });
});

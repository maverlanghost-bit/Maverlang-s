import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { importarCopy, NOT_CONFIGURED_MESSAGE } from "@/content/i18n/extra-importar";
import { scanFile } from "@/lib/content/copy-guard";
import {
  aiLimitPolicy,
  DEFAULT_XAI_MODEL,
  importPortfolioFromImage,
  inspectImageDataUrl,
  MAX_IMAGE_BYTES,
  MAX_IMPORT_BODY_BYTES,
  offeredCatalog,
  PORTFOLIO_RESPONSE_FORMAT,
  reserveAiCall,
  resolveTicker,
  XAI_CHAT_URL,
  type CatalogRef,
} from "@/lib/ai/vision-import";
import { isCatalogSymbol } from "@/lib/catalog/symbol";
import {
  EXTERNAL_HOLDINGS_KEY,
  parseShareQuantity,
  readLocalExternalHoldings,
  saveExternalHoldings,
  type HoldingsBackend,
  type KeyValueStore,
} from "@/lib/portfolio/external-holdings";
import { __resetRateLimitsForTests, RATE_LIMIT_POLICIES } from "@/lib/security/rate-limit";

const ROOT = path.resolve(__dirname, "..", "..");
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const CATALOG: CatalogRef[] = [
  { symbol: "AAPLx", name: "Apple", underlying: "AAPL", preferred: true },
  { symbol: "AAPLon", name: "Apple", underlying: "AAPL", preferred: false },
  { symbol: "MSFTx", name: "Microsoft", underlying: "MSFT", preferred: true },
  { symbol: "AMZNx", name: "Amazon.com", underlying: "AMZN", preferred: true },
  { symbol: "BRK.Bx", name: "Berkshire Hathaway", underlying: "BRK.B", preferred: true },
];

const savedEnv = {
  backend: process.env.RATE_LIMIT_BACKEND,
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
  model: process.env.XAI_MODEL,
  key: process.env.XAI_API_KEY,
};

beforeEach(() => {
  process.env.RATE_LIMIT_BACKEND = "memory";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  __resetRateLimitsForTests();
});

afterEach(() => {
  restore("RATE_LIMIT_BACKEND", savedEnv.backend);
  restore("UPSTASH_REDIS_REST_URL", savedEnv.url);
  restore("UPSTASH_REDIS_REST_TOKEN", savedEnv.token);
  restore("XAI_MODEL", savedEnv.model);
  restore("XAI_API_KEY", savedEnv.key);
  __resetRateLimitsForTests();
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function pngDataUrl(): string {
  return `data:image/png;base64,${PNG}`;
}

function jpegDataUrl(): string {
  const payload = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9]).toString("base64");
  return `data:image/jpeg;base64,${payload}`;
}

function xaiResponse(positions: unknown): Response {
  return Response.json({
    choices: [{ message: { content: JSON.stringify({ positions }) } }],
  });
}

describe("foto de cartera", () => {
  it("acepta png y jpg, y rechaza el resto y el peso", () => {
    const png = inspectImageDataUrl(pngDataUrl());
    expect(png.ok).toBe(true);
    if (png.ok) expect(png.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    const jpg = inspectImageDataUrl(jpegDataUrl().replace("image/jpeg", "image/jpg"));
    expect(jpg.ok).toBe(true);
    if (jpg.ok) expect(jpg.mediaType).toBe("image/jpeg");
    expect(inspectImageDataUrl("data:image/webp;base64,AAAA").ok).toBe(false);
    expect(inspectImageDataUrl("data:image/gif;base64,AAAA").ok).toBe(false);
    expect(inspectImageDataUrl("").ok).toBe(false);
    const maxChars = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
    expect(inspectImageDataUrl(`data:image/png;base64,${"A".repeat(maxChars + 4)}`).ok).toBe(false);
    expect(MAX_IMAGE_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_IMPORT_BODY_BYTES).toBeGreaterThan(MAX_IMAGE_BYTES);
  });

  it("cruza el catálogo ofrecido y no adivina un símbolo ajeno", () => {
    const catalog = offeredCatalog();
    expect(catalog.length).toBeGreaterThan(400);
    expect(catalog.every((item) => isCatalogSymbol(item.symbol))).toBe(true);
    expect(resolveTicker("AAPL")?.symbol).toBe("AAPLx");
    expect(resolveTicker("AAPLon")?.symbol).toBe("AAPLon");
    expect(resolveTicker("Apple Inc.")?.symbol).toBe("AAPLx");
    expect(resolveTicker("BRK.B")?.symbol).toBe("BRK.Bx");
    expect(resolveTicker("ZZZZ-NO-EXISTE")).toBeNull();
  });

  it("sin clave no llama a la red", async () => {
    delete process.env.XAI_API_KEY;
    const fetchImpl = vi.fn();
    const result = await importPortfolioFromImage({ image: pngDataUrl(), fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "not_configured", message: NOT_CONFIGURED_MESSAGE });
  });

  it("arma el widget y no devuelve el precio ni la foto", async () => {
    const fetchImpl = vi.fn(async () =>
      xaiResponse([
        { ticker: "AAPL", name: "Apple", quantity: "1,5", price: 12345.67, extra: "ignorar" },
        { ticker: "Nope", name: null, quantity: null, price: null },
        { ticker: null, name: "Microsoft", quantity: 3, price: null },
      ]),
    );
    const result = await importPortfolioFromImage({
      image: pngDataUrl(),
      apiKey: "test-key",
      fetchImpl,
      catalog: CATALOG,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(XAI_CHAT_URL);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-key");
    const body = JSON.parse(String(init.body)) as {
      model: string;
      response_format: { type: string };
    };
    expect(body.model).toBe(DEFAULT_XAI_MODEL);
    expect(body.response_format).toEqual(PORTFOLIO_RESPONSE_FORMAT);
    expect(result).toEqual({
      ok: true,
      text: "Encontramos 3. Revísalas antes de guardar.",
      widgets: [
        {
          type: "import-preview",
          positions: [
            { ticker: "AAPLx", name: "Apple", quantity: 1.5, matched: true },
            { ticker: "Nope", name: null, quantity: null, matched: false },
            { ticker: "MSFTx", name: "Microsoft", quantity: 3, matched: true },
          ],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("12345.67");
    expect(JSON.stringify(result)).not.toContain("data:image");
  });

  it("un proveedor caído es upstream y no filtra el cuerpo", async () => {
    const fetchImpl = vi.fn(async () => new Response("data:image/png;base64,SECRETO", { status: 500 }));
    const result = await importPortfolioFromImage({
      image: pngDataUrl(),
      apiKey: "test-key",
      fetchImpl,
      catalog: CATALOG,
    });
    expect(result).toEqual({
      ok: false,
      error: "upstream",
      message: "No pudimos leer la foto. Intenta otra vez.",
    });
    expect(JSON.stringify(result)).not.toContain("SECRETO");
  });

  it("la foto mala no sale a la red", async () => {
    const fetchImpl = vi.fn();
    const result = await importPortfolioFromImage({
      image: "data:image/gif;base64,AAAA",
      apiKey: "test-key",
      fetchImpl,
      catalog: CATALOG,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("bad_request");
  });

  it("el tope ai es el de la política o el local de 10 por minuto", async () => {
    const named = (RATE_LIMIT_POLICIES as { ai?: { limit: number; windowMs: number } }).ai;
    expect(aiLimitPolicy()).toEqual(named ?? { limit: 10, windowMs: 60_000 });
    const subject = "vision-import-test";
    const policy = aiLimitPolicy();
    for (let index = 0; index < policy.limit; index += 1) {
      expect((await reserveAiCall(subject)).ok).toBe(true);
    }
    expect((await reserveAiCall(subject)).ok).toBe(false);
  });
});

describe("seguimiento externo", () => {
  it("sin tabla queda en el dispositivo y no pisa otras filas", async () => {
    let raw: string | null = JSON.stringify({
      v: 1,
      items: [{ ticker: "MSFTx", name: "Microsoft", quantity: 1, source: "photo", createdAt: "2020-01-01T00:00:00.000Z" }],
    });
    const store: KeyValueStore = {
      getItem: () => raw,
      setItem: (_key, value) => {
        raw = value;
      },
    };
    const backend: HoldingsBackend = {
      userId: async () => "user-1",
      replace: async () => "missing",
    };
    const saved = await saveExternalHoldings(
      [
        { ticker: "AAPLx", name: "Apple", quantity: 2 },
        { ticker: "AAPL", name: "Apple", quantity: 9 },
        { ticker: "AAPLx", name: "Apple", quantity: 4 },
      ],
      { store, backend },
    );
    expect(saved).toEqual({ ok: true, where: "device", saved: 1 });
    const items = readLocalExternalHoldings(store);
    expect(items.map((item) => item.ticker).sort()).toEqual(["AAPLx", "MSFTx"]);
    expect(items.find((item) => item.ticker === "AAPLx")?.quantity).toBe(4);
    expect(raw ?? "").not.toContain(EXTERNAL_HOLDINGS_KEY);
    expect(raw ?? "").toContain("AAPLx");
  });

  it("con tabla no escribe en el dispositivo", async () => {
    let raw: string | null = null;
    const store: KeyValueStore = {
      getItem: () => raw,
      setItem: (_key, value) => {
        raw = value;
      },
    };
    const replaced: { ticker: string; quantity: number }[] = [];
    const backend: HoldingsBackend = {
      userId: async () => "user-1",
      replace: async (_userId, rows) => {
        replaced.push(...rows);
        return "ok";
      },
    };
    const saved = await saveExternalHoldings([{ ticker: "MSFTx", name: null, quantity: 1.5 }], { store, backend });
    expect(saved).toEqual({ ok: true, where: "account", saved: 1 });
    expect(replaced).toEqual([{ ticker: "MSFTx", quantity: 1.5 }]);
    expect(raw).toBeNull();
  });

  it("cantidad chilena y filas vacías", () => {
    expect(parseShareQuantity("1,5")).toBe(1.5);
    expect(parseShareQuantity("1.234,5")).toBe(1234.5);
    expect(parseShareQuantity("0")).toBeNull();
    expect(parseShareQuantity("")).toBeNull();
  });
});

describe("textos y ruta", () => {
  it("es-CL y en dicen lo mismo y no prometen un resultado", () => {
    expect(Object.keys(importarCopy.en).sort()).toEqual(Object.keys(importarCopy.esCL).sort());
    expect(importarCopy.esCL.notConfigured).toBe(NOT_CONFIGURED_MESSAGE);
    expect(importarCopy.esCL.addPortfolio).toBe("Agregar a mi cartera");
    expect(importarCopy.esCL.favoritesOnly).toBe("Solo a favoritas");
    expect(importarCopy.esCL.deviceNotice).toBe("Se guarda en este dispositivo.");
    expect(importarCopy.esCL.notTokens).toContain("No son tokens comprados");
    expect(importarCopy.esCL.disclaimer).toBe("Solo informativo, no es una recomendación.");
    const blob = `${JSON.stringify(importarCopy.esCL)}\n${JSON.stringify(importarCopy.en)}`;
    expect(blob).not.toMatch(/\b(compra|vende|buy|sell)\b/i);
  });

  it("la ruta valida, limita y no guarda", () => {
    const route = readFileSync(path.join(ROOT, "app/api/ai/import-portfolio/route.ts"), "utf8");
    expect(route).toContain("parseJson");
    expect(route).toContain("assertSameOrigin");
    expect(route).toContain("lib/api/contracts");
    expect(route).toContain("tradableSymbolSchema");
    expect(route).toContain("reserveAiCall");
    expect(route).toContain("503");
    expect(route).toContain("private, no-store");
    expect(route).not.toContain("localStorage");
    expect(route).not.toContain("external_holdings");
    const vision = readFileSync(path.join(ROOT, "lib/ai/vision-import.ts"), "utf8");
    expect(vision).not.toContain("localStorage");
    expect(vision).not.toContain("external_holdings");
    const sql = readFileSync(path.join(ROOT, "supabase/migrations/0035_external_holdings.sql"), "utf8");
    expect(sql).toContain("references auth.users");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("external_holdings_user_ticker_uidx");
    expect(sql).toContain("'photo'");
    for (const relative of [
      "content/i18n/extra-importar.ts",
      "components/ai/import/import-preview.tsx",
      "components/ai/import/ticker-field.tsx",
      "app/api/ai/import-portfolio/route.ts",
    ]) {
      const source = readFileSync(path.join(ROOT, relative), "utf8");
      expect(scanFile(relative, source), relative).toEqual([]);
    }
  });
});

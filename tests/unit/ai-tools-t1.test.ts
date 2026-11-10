import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Q1 · Tanda 1: herramientas nuevas del asistente contra el contrato de §1.5/§1.6.
 * Todo corre en node, sin red: precios del mock, cartera de ejemplo y
 * `readCompanyForSymbol` simulado. El modelo también es falso (`complete`).
 */

const companyFactsSvc = vi.hoisted(() => ({
  readCompanyForSymbol: vi.fn<(symbol: string) => Promise<Record<string, unknown> | null>>(),
}));

vi.mock("@/lib/services/company-facts.supabase", () => ({
  readCompanyForSymbol: companyFactsSvc.readCompanyForSymbol,
  companyUnderlyingKey: (symbol: string) => symbol,
}));

import { aiMessages } from "@/content/i18n/extra-b";
import { runChat, withDisclaimer } from "@/lib/ai/run-chat";
import { AI_TOOLS, type AssistantDeps } from "@/lib/ai/tools";
import type { AiWidget } from "@/lib/ai/types";
import { mockFx } from "@/lib/mocks/fx";
import { priceHistory, quoteFor } from "@/lib/mocks/prices";
import type { Portfolio, Range } from "@/lib/types";

const copy = aiMessages.esCL;
const ROOT = path.resolve(__dirname, "..", "..");
const NOW = Date.UTC(2026, 0, 15);
const TSLA_PRICE = 248.9;

/** El tercer parámetro de `runChat` (el proveedor), sin el `undefined` del default. */
type Complete = NonNullable<Parameters<typeof runChat>[2]>;

const CATALOG = [
  { ticker: "TSLAx", name: "Tesla", tradable: true },
  { ticker: "NVDAx", name: "Nvidia", tradable: true },
  { ticker: "AAPLx", name: "Apple", tradable: true },
] as const;

function resolve(query: string) {
  const key = query.trim().toLowerCase();
  return CATALOG.find((asset) => asset.ticker.toLowerCase() === key || asset.name.toLowerCase() === key) ?? null;
}

function position(symbol: string, valueUsd: number, allocationPct: number): Portfolio["positions"][number] {
  const price = quoteFor(symbol).priceUsd;
  return {
    symbol,
    shares: valueUsd / price,
    multiplier: 1,
    avgCostUsd: price,
    priceUsd: price,
    valueUsd,
    pnlUsd: null,
    pnlPct: null,
    allocationPct,
  };
}

/** Cartera de ejemplo: 1.000 US$, sin efectivo, 50 / 30 / 20 %. */
const SAMPLE_PORTFOLIO: Portfolio = {
  address: "demo-portfolio",
  totalUsd: 1000,
  cashUsdc: 0,
  positions: [position("TSLAx", 500, 0.5), position("NVDAx", 300, 0.3), position("AAPLx", 200, 0.2)],
  pnlUsd: null,
  pnlPct: null,
  updatedAt: "2026-01-15T00:00:00.000Z",
};

const EMPTY_PORTFOLIO: Portfolio = {
  address: "demo-empty",
  totalUsd: 0,
  cashUsdc: 0,
  positions: [],
  pnlUsd: null,
  pnlPct: null,
  updatedAt: "2026-01-15T00:00:00.000Z",
};

const COMPANY_VIEW: Record<string, unknown> = {
  symbol: "AAPLx",
  underlying: "AAPL",
  name: "Apple Inc.",
  sector: "Technology",
  sic: "3571",
  exchange: "NASDAQ",
  fiscalYearEnd: "0927",
  sharesOutstanding: 15_000_000_000,
  sharesAsOf: "2026-06-30",
  lastClose: 228.4,
  lastCloseDate: "2026-11-06",
  marketCapUsd: 3_400_000_000_000,
  pe: 34.5,
  dividendYield: 0.0044,
  epsTtm: 6.6,
  epsPeriodEnd: "2026-06-30",
  revenueTtm: 400_000_000_000,
  netIncomeTtm: 100_000_000_000,
  dividendsPerShareTtm: 1,
  last10k: "2026-10-30",
  last10q: "2026-07-30",
  lastFilingForm: "10-K",
  kind: "company",
  reportCurrency: "USD",
  fundFamily: null,
  fundNetAssets: null,
  fundReportDate: null,
  fundHoldingsCount: null,
  fundTopHoldings: null,
  source: "sec-edgar",
  sourceUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/aapl-20260927.htm",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

interface DepsOptions {
  portfolio?: Portfolio | "sign-in";
  prices?: boolean;
}

/**
 * Dependencias del asistente con precios del mock y cartera de ejemplo.
 * Se agregan alias (`fx`, `companyFacts`) por si la implementación los toma
 * de `deps`: el contrato no fija la forma interna, sólo el resultado.
 */
function deps(options: DepsOptions = {}): AssistantDeps {
  const withPrices = options.prices !== false;
  const portfolio = options.portfolio ?? "sign-in";
  const base = {
    prices: {
      list: async (symbols: string[]) => (withPrices ? symbols.map((symbol) => quoteFor(symbol)) : []),
      history: async (symbol: string, range: Range) => (withPrices ? priceHistory(symbol, range, NOW) : []),
      fx: async () => mockFx(),
    },
    fx: async () => mockFx(),
    usdClp: 950,
    getUsdClp: async () => mockFx(),
    companyFacts: async (symbol: string) => companyFactsSvc.readCompanyForSymbol(symbol),
    loadCompanyFacts: async (symbol: string) => companyFactsSvc.readCompanyForSymbol(symbol),
    loadPortfolio: async () =>
      portfolio === "sign-in" ? { kind: "sign-in" as const } : { kind: "ok" as const, portfolio },
    resolveTicker: async (query: string) => resolve(query),
    searchTickers: async (query: string) => {
      const key = query.trim().toLowerCase();
      return CATALOG.filter(
        (asset) => asset.ticker.toLowerCase().includes(key) || asset.name.toLowerCase().includes(key),
      );
    },
  };
  return base as unknown as AssistantDeps;
}

interface ToolStep {
  name: string;
  args: Record<string, unknown>;
}

/** El modelo falso: pide una tool y, con el resultado, cierra con `answer`. */
function scripted(tool: ToolStep, answer: string) {
  const toolContents: string[] = [];
  const complete: Complete = async (messages) => {
    const toolMessages = messages.filter((message) => message.role === "tool");
    if (toolMessages.length === 0) {
      return {
        content: "",
        toolCalls: [{ id: "call_1", name: tool.name, arguments: JSON.stringify(tool.args) }],
      };
    }
    for (const message of toolMessages) {
      if (typeof message.content === "string") toolContents.push(message.content);
    }
    return { content: answer, toolCalls: [] };
  };
  return { complete, toolContents };
}

function request(): Request {
  return new Request("https://maverlang.test/api/ai/chat", { method: "POST" });
}

async function run(question: string, tool: ToolStep, answer: string, assistantDeps: AssistantDeps = deps()) {
  const script = scripted(tool, answer);
  const result = await runChat({ messages: [{ role: "user", content: question }], req: request() }, assistantDeps, script.complete);
  return { text: result.text, widgets: result.widgets, toolContents: script.toolContents };
}

function widgetOf<K extends AiWidget["type"]>(
  widgets: AiWidget[],
  type: K,
): Extract<AiWidget, { type: K }> | undefined {
  return widgets.find((widget): widget is Extract<AiWidget, { type: K }> => widget.type === type);
}

function digits(text: string): boolean {
  return /\d/.test(text);
}

function withoutDisclaimer(text: string): string {
  return text.replace(copy.disclaimer, "").trim();
}

beforeEach(() => {
  vi.clearAllMocks();
  companyFactsSvc.readCompanyForSymbol.mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("herramientas T1: registro y sólo lectura", () => {
  it("las cuatro tools nuevas están registradas con sus argumentos", () => {
    const names = AI_TOOLS.map((tool) => tool.function.name);
    for (const name of ["get_company_facts", "portfolio_today", "simulate_buy", "propose_price_alert"]) {
      expect(names).toContain(name);
    }
    const alert = AI_TOOLS.find((tool) => tool.function.name === "propose_price_alert");
    expect(alert?.function.parameters.required).toEqual(
      expect.arrayContaining(["ticker", "direction", "thresholdUsd"]),
    );
    const properties = alert?.function.parameters.properties as
      | Record<string, { enum?: string[] }>
      | undefined;
    expect(properties?.direction?.enum).toEqual(["above", "below"]);
  });

  it("tools.ts no llama a endpoints de escritura ni a operaciones", () => {
    const source = readFileSync(path.join(ROOT, "lib", "ai", "tools.ts"), "utf8");
    for (const forbidden of [
      "createPriceAlert(",
      "deletePriceAlert(",
      ".insert(",
      ".upsert(",
      ".submit(",
    ]) {
      expect(source.includes(forbidden)).toBe(false);
    }
  });
});

describe("get_company_facts", () => {
  it("devuelve la ficha con fuente y sin ceros inventados", async () => {
    companyFactsSvc.readCompanyForSymbol.mockResolvedValue(COMPANY_VIEW);
    const result = await run(
      "muéstrame los datos de Apple",
      { name: "get_company_facts", args: { ticker: "AAPLx" } },
      "Revisa la ficha de la empresa en la tarjeta.",
    );
    const widget = widgetOf(result.widgets, "company");
    expect(widget).toBeTruthy();
    if (!widget) return;
    expect(widget.ticker).toBe("AAPLx");
    expect(widget.name.length).toBeGreaterThan(0);
    expect(widget.source.length).toBeGreaterThan(0);
    expect(widget.asOf === null || /^\d{4}-\d{2}-\d{2}/.test(widget.asOf)).toBe(true);
    expect(widget.facts.length).toBeGreaterThan(0);
    for (const fact of widget.facts) {
      expect(fact.label.length).toBeGreaterThan(0);
      if (fact.value !== null) {
        expect(typeof fact.value).toBe("string");
        expect(fact.value).not.toMatch(/^(0|0[.,]0+|NaN|null|undefined)$/);
      }
    }
  });

  it("sin ficha no inventa cifras", async () => {
    companyFactsSvc.readCompanyForSymbol.mockResolvedValue(null);
    const result = await run(
      "muéstrame los datos de Apple",
      { name: "get_company_facts", args: { ticker: "AAPLx" } },
      copy.notFound,
    );
    const widget = widgetOf(result.widgets, "company");
    if (widget) {
      for (const fact of widget.facts) {
        expect(fact.value === null || !/^0([.,]0+)?$/.test(fact.value)).toBe(true);
      }
      return;
    }
    expect(withoutDisclaimer(result.text)).not.toMatch(/\d/);
  });
});

describe("portfolio_today", () => {
  it("calcula HHI, posiciones efectivas y top 1/3 con la cartera de ejemplo", async () => {
    const result = await run(
      "¿cómo está mi cartera?",
      { name: "portfolio_today", args: {} },
      "La tarjeta muestra tu cartera y su concentración.",
      deps({ portfolio: SAMPLE_PORTFOLIO }),
    );
    const widget = widgetOf(result.widgets, "portfolio-today");
    expect(widget).toBeTruthy();
    if (!widget) return;
    expect(widget.totalUsd).toBe(1000);
    expect(widget.cashUsdc).toBe(0);
    expect(widget.positions.map((item) => item.ticker)).toEqual(["TSLAx", "NVDAx", "AAPLx"]);
    const values = widget.positions.map((item) => item.valueUsd);
    [500, 300, 200].forEach((expected, index) => {
      expect(values[index]).not.toBeNull();
      expect(values[index] ?? 0).toBeCloseTo(expected, 4);
    });
    const weights = widget.positions.map((item) => item.weightPct);
    [50, 30, 20].forEach((expected, index) => {
      expect(weights[index]).not.toBeNull();
      expect(weights[index] ?? 0).toBeCloseTo(expected, 4);
    });
    expect(widget.hhi).not.toBeNull();
    expect(widget.hhi ?? 0).toBeCloseTo(0.38, 4);
    expect(widget.effectivePositions).not.toBeNull();
    expect(widget.effectivePositions ?? 0).toBeCloseTo(1 / 0.38, 1);
    expect(widget.top1Pct ?? 0).toBeCloseTo(50, 1);
    expect(widget.top3Pct ?? 0).toBeCloseTo(100, 1);
    expect(result.text).toBe(withDisclaimer("La tarjeta muestra tu cartera y su concentración.", true));
  });

  it("sin posiciones la concentración es null, no 0", async () => {
    const result = await run(
      "¿cómo está mi cartera?",
      { name: "portfolio_today", args: {} },
      "La cartera está vacía.",
      deps({ portfolio: EMPTY_PORTFOLIO }),
    );
    const widget = widgetOf(result.widgets, "portfolio-today");
    expect(widget).toBeTruthy();
    if (!widget) return;
    expect(widget.positions).toEqual([]);
    expect(widget.totalUsd).toBe(0);
    // Sin posiciones no hay concentración: 1/HHI nunca puede ser Infinity.
    expect(widget.effectivePositions).toBeNull();
    expect(widget.hhi === null || widget.hhi === 0).toBe(true);
    expect(widget.top1Pct === null || widget.top1Pct === 0).toBe(true);
    expect(widget.top3Pct === null || widget.top3Pct === 0).toBe(true);
  });
});

describe("simulate_buy", () => {
  it("suma aporte inicial y mensual, y no promete rentabilidad", async () => {
    const result = await run(
      "simula 500 dólares en Tesla",
      { name: "simulate_buy", args: { ticker: "TSLAx", amountUsd: 500, monthlyClp: 95000, months: 12 } },
      "La simulación usa el precio actual, no una proyección.",
    );
    const widget = widgetOf(result.widgets, "simulation");
    expect(widget).toBeTruthy();
    if (!widget) return;
    expect(widget.ticker).toBe("TSLAx");
    expect(widget.priceUsd).toBe(TSLA_PRICE);
    expect(widget.amountUsd).toBe(500);
    expect(widget.monthlyClp).toBe(95000);
    expect(widget.months).toBe(12);
    expect(widget.usdClp).toBe(950);
    expect(widget.monthlyUsd ?? 0).toBeCloseTo(100, 6);
    expect(widget.totalUsd ?? 0).toBeCloseTo(1700, 6);
    expect(widget.units).not.toBeNull();
    expect(widget.units ?? 0).toBeGreaterThan(0);
    const blob = `${result.text}\n${JSON.stringify(widget)}\n${result.toolContents.join("\n")}`;
    expect(blob).not.toMatch(/rentabilidad|ganar[aá]s|retorno esperado/i);
  });

  it("sin aporte mensual el total es exactamente el aporte", async () => {
    const result = await run(
      "simula 500 dólares en Tesla",
      { name: "simulate_buy", args: { ticker: "TSLAx", amountUsd: 500 } },
      "Esta es la aritmética de la compra.",
    );
    const widget = widgetOf(result.widgets, "simulation");
    expect(widget).toBeTruthy();
    if (!widget) return;
    expect(widget.totalUsd).toBe(500);
    // Con un solo aporte, las unidades salen del aporte y el precio actual.
    expect(Math.abs((widget.units ?? 0) * TSLA_PRICE - 500)).toBeLessThan(0.01);
    expect(widget.monthlyUsd === null || widget.monthlyUsd === 0).toBe(true);
    expect(widget.months === null || widget.months === 0).toBe(true);
  });

  it("sin precio no inventa 0 en precio ni unidades", async () => {
    const result = await run(
      "simula 500 dólares en Tesla",
      { name: "simulate_buy", args: { ticker: "TSLAx", amountUsd: 500 } },
      "No hay precio disponible para la simulación.",
      deps({ prices: false }),
    );
    const widget = widgetOf(result.widgets, "simulation");
    if (widget) {
      expect(widget.priceUsd).toBeNull();
      expect(widget.units).toBeNull();
      expect(widget.totalUsd).toBe(500);
      return;
    }
    expect(withoutDisclaimer(result.text)).not.toMatch(/\d/);
  });
});

describe("propose_price_alert", () => {
  it("propone la alerta con un widget y no escribe nada", async () => {
    const fetchSpy = vi.fn(async () => new Response("no", { status: 500 }));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await run(
      "avísame si Tesla pasa de 300 dólares",
      { name: "propose_price_alert", args: { ticker: "TSLAx", direction: "above", thresholdUsd: 300 } },
      "Te preparé la alerta; falta que la confirmes.",
    );
    const widget = widgetOf(result.widgets, "alert-confirm");
    expect(widget).toBeTruthy();
    if (!widget) return;
    expect(widget.ticker).toBe("TSLAx");
    expect(widget.name.length).toBeGreaterThan(0);
    expect(widget.direction).toBe("above");
    expect(widget.thresholdUsd).toBe(300);
    expect(widget.priceUsd === null || widget.priceUsd === TSLA_PRICE).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.toolContents.join(" ")).not.toMatch(/creada correctamente|guardada correctamente|registrada correctamente/i);
  });

  it("acepta la dirección below", async () => {
    const result = await run(
      "avísame si Tesla baja de 200 dólares",
      { name: "propose_price_alert", args: { ticker: "TSLAx", direction: "below", thresholdUsd: 200 } },
      "Te preparé la alerta; falta que la confirmes.",
    );
    const widget = widgetOf(result.widgets, "alert-confirm");
    expect(widget).toBeTruthy();
    expect(widget?.direction).toBe("below");
    expect(widget?.thresholdUsd).toBe(200);
  });
});

describe("ticker fuera del catálogo", () => {
  it("get_stock responde sin cifras y sin widget", async () => {
    const result = await run(
      "dame el precio de ZZZZ",
      { name: "get_stock", args: { query: "ZZZZ" } },
      copy.notFound,
    );
    expect(result.widgets).toEqual([]);
    expect(result.text).toBe(withDisclaimer(copy.notFound, true));
    expect(result.toolContents.join(" ")).not.toMatch(/\d/);
  });

  it("simulate_buy tampoco inventa un precio", async () => {
    const result = await run(
      "simula 100 dólares en ZZZZ",
      { name: "simulate_buy", args: { ticker: "ZZZZ", amountUsd: 100 } },
      copy.notFound,
    );
    expect(result.widgets).toEqual([]);
    expect(result.text).toBe(withDisclaimer(copy.notFound, true));
    expect(digits(result.toolContents.join(" "))).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Q1 · Tanda 1: banco anti-invención del asistente.
 * 14 preguntas típicas (consejo, promesas de ganancia, tickers inventados,
 * cartera, simulación, alertas, ficha) corridas con `runChat`, precios del
 * mock y un modelo falso que sólo repite cifras devueltas por las tools.
 * No usa red ni timers.
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
import type { AssistantDeps } from "@/lib/ai/tools";
import type { AiWidget } from "@/lib/ai/types";
import { mockFx } from "@/lib/mocks/fx";
import { priceHistory, quoteFor } from "@/lib/mocks/prices";
import type { Portfolio, Range } from "@/lib/types";

const copy = aiMessages.esCL;
const NOW = Date.UTC(2026, 0, 15);

/** El tercer parámetro de `runChat` (el proveedor), sin el `undefined` del default. */
type Complete = NonNullable<Parameters<typeof runChat>[2]>;

/** Consejo directo, promesa de rentabilidad o garantía: prohibido en toda salida. */
const ADVICE =
  /deber[ií]as (comprar|vender|invertir)|te recomiendo|recomiendo (comprar|vender)|es una buena (compra|inversi[oó]n)|vas a ganar|ganar[aá]s|retorno esperado|rentabilidad asegurada/i;

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

const PORTFOLIO: Portfolio = {
  address: "demo-bank",
  totalUsd: 1000,
  cashUsdc: 0,
  positions: [position("TSLAx", 500, 0.5), position("NVDAx", 300, 0.3), position("AAPLx", 200, 0.2)],
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

function deps(): AssistantDeps {
  const base = {
    prices: {
      list: async (symbols: string[]) => symbols.map((symbol) => quoteFor(symbol)),
      history: async (symbol: string, range: Range) => priceHistory(symbol, range, NOW),
      fx: async () => mockFx(),
    },
    fx: async () => mockFx(),
    usdClp: 950,
    getUsdClp: async () => mockFx(),
    companyFacts: async (symbol: string) => companyFactsSvc.readCompanyForSymbol(symbol),
    loadCompanyFacts: async (symbol: string) => companyFactsSvc.readCompanyForSymbol(symbol),
    loadPortfolio: async () => ({ kind: "ok" as const, portfolio: PORTFOLIO }),
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

interface BankCase {
  question: string;
  tool: { name: string; args: Record<string, unknown> };
  answer: string;
  widget: AiWidget["type"] | null;
}

/**
 * Cada respuesta usa sólo cifras que la tool devolvió (o ninguna cifra).
 * Si el asistente inventara un dato, el chequeo de grounding falla.
 */
const BANK: BankCase[] = [
  {
    question: "¿qué acción compro?",
    tool: { name: "search_stock", args: { text: "a" } },
    answer: "No entrego recomendaciones de compra ni de venta. Puedo mostrarte datos de AAPLx, NVDAx o TSLAx.",
    widget: null,
  },
  {
    question: "¿cuánto voy a ganar si invierto 500 dólares?",
    tool: { name: "simulate_buy", args: { ticker: "TSLAx", amountUsd: 500, monthlyClp: 0, months: 1 } },
    answer: "No puedo estimar ganancias futuras: la simulación sólo suma lo aportado, US$ 500.",
    widget: "simulation",
  },
  {
    question: "dame el precio de XYZ inventada",
    tool: { name: "get_stock", args: { query: "XYZ" } },
    answer: copy.notFound,
    widget: null,
  },
  {
    question: "¿cómo está mi cartera?",
    tool: { name: "portfolio_today", args: {} },
    answer: "La tarjeta resume tu cartera y su concentración.",
    widget: "portfolio-today",
  },
  {
    question: "¿cuántas acciones de Apple puedo comprar con 500 dólares?",
    tool: { name: "simulate_buy", args: { ticker: "AAPLx", amountUsd: 500 } },
    answer: "Con US$ 500, la simulación muestra las unidades al precio actual; no es una proyección.",
    widget: "simulation",
  },
  {
    question: "compárame Tesla y Nvidia",
    tool: { name: "compare_stocks", args: { tickers: ["TSLAx", "NVDAx"], range: "1M" } },
    answer: "Comparé TSLAx y NVDAx en 1M.",
    widget: "compare",
  },
  {
    question: "¿qué tan concentrada está mi cartera?",
    tool: { name: "portfolio_today", args: {} },
    answer: "La tarjeta muestra el HHI y las posiciones efectivas de tu cartera.",
    widget: "portfolio-today",
  },
  {
    question: "avísame si Tesla pasa de 300 dólares",
    tool: { name: "propose_price_alert", args: { ticker: "TSLAx", direction: "above", thresholdUsd: 300 } },
    answer: "Propuse una alerta para TSLAx sobre US$ 300; falta que la confirmes.",
    widget: "alert-confirm",
  },
  {
    question: "¿debería vender mis acciones?",
    tool: { name: "get_portfolio", args: {} },
    answer: "No entrego consejos de inversión ni recomendaciones de compra o venta.",
    widget: "portfolio",
  },
  {
    question: "muéstrame los datos de la empresa Apple",
    tool: { name: "get_company_facts", args: { ticker: "AAPLx" } },
    answer: "Revisa la ficha de la empresa en la tarjeta; incluye fuente y fecha.",
    widget: "company",
  },
  {
    question: "¿cuánto vale Tesla?",
    tool: { name: "get_stock", args: { query: "TSLAx", range: "1D" } },
    answer: "El precio disponible es US$ 248.9.",
    widget: "stock",
  },
  {
    question: "dame una recomendación para invertir mis ahorros",
    tool: { name: "search_stock", args: { text: "a" } },
    answer: "No entrego recomendaciones de inversión. Puedo explicarte los datos y los riesgos.",
    widget: null,
  },
  {
    question: "¿cuánto gano al mes con acciones?",
    tool: { name: "simulate_buy", args: { ticker: "NVDAx", amountUsd: 250, monthlyClp: 47500, months: 6 } },
    answer: "No puedo prometer ganancias: la simulación suma US$ 550 aportados.",
    widget: "simulation",
  },
  {
    question: "¿cuánto vale mi acción de banano?",
    tool: { name: "get_stock", args: { query: "banano" } },
    answer: copy.notFound,
    widget: null,
  },
];

function request(): Request {
  return new Request("https://maverlang.test/api/ai/chat", { method: "POST" });
}

function numbersIn(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)?/g) ?? [];
}

async function runCase(item: BankCase) {
  const toolContents: string[] = [];
  const complete: Complete = async (messages) => {
    const toolMessages = messages.filter((message) => message.role === "tool");
    if (toolMessages.length === 0) {
      return {
        content: "",
        toolCalls: [{ id: "call_1", name: item.tool.name, arguments: JSON.stringify(item.tool.args) }],
      };
    }
    for (const message of toolMessages) {
      if (typeof message.content === "string") toolContents.push(message.content);
    }
    return { content: item.answer, toolCalls: [] };
  };
  const result = await runChat(
    { messages: [{ role: "user", content: item.question }], req: request() },
    deps(),
    complete,
  );
  return { text: result.text, widgets: result.widgets, toolContents };
}

beforeEach(() => {
  vi.clearAllMocks();
  companyFactsSvc.readCompanyForSymbol.mockResolvedValue(COMPANY_VIEW);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("banco anti-invención", () => {
  it("tiene al menos 10 preguntas distintas", () => {
    expect(BANK.length).toBeGreaterThanOrEqual(10);
    expect(new Set(BANK.map((item) => item.question)).size).toBe(BANK.length);
  });

  it.each(BANK)("«$question»: aviso, cifras de tools y ningún consejo", async (item) => {
    const result = await runCase(item);
    expect(result.toolContents.length).toBeGreaterThan(0);
    // withDisclaimer se aplica siempre: todas las respuestas son sobre acciones.
    expect(result.text).toBe(withDisclaimer(item.answer, true));
    expect(result.text.endsWith(copy.disclaimer)).toBe(true);

    const blob = `${result.text}\n${JSON.stringify(result.widgets)}\n${result.toolContents.join("\n")}`;
    expect(blob).not.toMatch(ADVICE);

    if (item.widget) {
      expect(result.widgets.map((widget) => widget.type)).toContain(item.widget);
    } else {
      expect(result.widgets).toEqual([]);
    }

    // Las cifras de la respuesta existen en lo que devolvió la tool.
    const grounded = result.toolContents.join("\n");
    for (const number of numbersIn(item.answer)) {
      expect(grounded.includes(number)).toBe(true);
    }
    if (!item.widget) {
      expect(numbersIn(item.answer.replace(copy.disclaimer, ""))).toEqual([]);
    }
  });

  it("el chequeo de grounding detecta una cifra inventada", async () => {
    const invented = "El precio es US$ 9999.";
    const result = await runCase({
      question: "¿cuánto vale Tesla?",
      tool: { name: "get_stock", args: { query: "TSLAx", range: "1D" } },
      answer: invented,
      widget: "stock",
    });
    const grounded = result.toolContents.join("\n");
    const outside = numbersIn(invented).filter((number) => !grounded.includes(number));
    expect(outside).toEqual(["9999"]);
  });
});

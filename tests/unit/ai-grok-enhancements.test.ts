import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Services } from "@/lib/services";
import type { Portfolio } from "@/lib/types";

/**
 * T47: rediseño del asistente IA estilo Grok. Este archivo cubre sólo piezas
 * puras (render SSR sin DOM y funciones de decisión), así que corre en
 * `environment: "node"` sin Supabase, sin red y sin timers reales.
 */

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({
      href,
      children,
      ...props
    }: {
      href: string;
      children?: ReactNode;
      className?: string;
      "aria-label"?: string;
      onClick?: () => void;
    }) => React.createElement("a", { href, ...props }, children),
  };
});

const mocks = vi.hoisted(() => {
  const getSession = vi.fn<(req: Request) => Promise<{ userId: string; walletAddress: string | null } | null>>();
  const portfolioGet = vi.fn<(address: string) => Promise<Portfolio>>();
  const getServices = vi.fn(() => ({
    auth: { getSession },
    portfolio: { get: portfolioGet },
  }));
  return {
    getSession,
    portfolioGet,
    getServices,
    isRealAccountRequest: vi.fn<(req: Request) => boolean>(),
    isUserDemoRequest: vi.fn<(req: Request) => boolean>(),
    isSupabaseAuth: vi.fn<() => boolean>(),
    demoGetPortfolio: vi.fn<(userId: string) => Promise<Portfolio>>(),
  };
});

vi.mock("@/lib/services", () => ({
  getServices: mocks.getServices as unknown as () => Services,
}));

vi.mock("@/lib/api/handler", () => ({
  isRealAccountRequest: mocks.isRealAccountRequest,
  isUserDemoRequest: mocks.isUserDemoRequest,
}));

vi.mock("@/lib/auth/demo-user", () => ({
  DEMO_WALLET_ADDRESS: "DEMO_WALLET_ADDRESS_FOR_TESTS",
}));

vi.mock("@/lib/auth/mode", () => ({
  isSupabaseAuth: mocks.isSupabaseAuth,
}));

vi.mock("@/lib/services/demo.supabase", () => ({
  demoSupabase: { getPortfolio: mocks.demoGetPortfolio },
}));

import { GrokThinkingCard } from "@/components/ai/grok-thinking-card";
import { MarketPulseBar } from "@/components/ai/market-pulse-bar";
import { applyReasoningPrefix, MAX_TEXT, ReasoningModeBar } from "@/components/ai/reasoning-mode-bar";
import { RichAssistantMessage } from "@/components/ai/rich-message";
import { loadPortfolioForAssistant } from "@/lib/ai/portfolio";

const REQ = new Request("https://maverlang.test/api/ai/chat", { method: "POST" });

const SESSION = { userId: "user-1", walletAddress: "W1" };

const PORTFOLIO: Portfolio = {
  address: "W1",
  totalUsd: 1234.56,
  cashUsdc: 34.56,
  positions: [],
  pnlUsd: null,
  pnlPct: null,
  updatedAt: "2026-11-06T12:00:00.000Z",
};

/** Markup → texto visible, sin etiquetas y con el espaciado colapsado. */
function plainText(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function html(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(node);
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isRealAccountRequest.mockReturnValue(false);
  mocks.isUserDemoRequest.mockReturnValue(false);
  mocks.isSupabaseAuth.mockReturnValue(true);
  mocks.getSession.mockResolvedValue(null);
  mocks.portfolioGet.mockResolvedValue(PORTFOLIO);
  mocks.demoGetPortfolio.mockResolvedValue(PORTFOLIO);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  errorSpy.mockRestore();
});

describe("loadPortfolioForAssistant", () => {
  it("en mock, una cuenta real no toca la cartera on-chain", async () => {
    vi.stubEnv("DATA_MODE", "mock");
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.isRealAccountRequest.mockReturnValue(true);

    await expect(loadPortfolioForAssistant(REQ)).resolves.toEqual({ kind: "real-empty" });
    expect(mocks.portfolioGet).not.toHaveBeenCalled();
  });

  it("en live, una cuenta real con billetera devuelve la cartera y la pide con esa dirección", async () => {
    vi.stubEnv("DATA_MODE", "live");
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.isRealAccountRequest.mockReturnValue(true);

    await expect(loadPortfolioForAssistant(REQ)).resolves.toEqual({ kind: "ok", portfolio: PORTFOLIO });
    expect(mocks.portfolioGet).toHaveBeenCalledTimes(1);
    expect(mocks.portfolioGet).toHaveBeenCalledWith("W1");
  });

  it("si el servicio de cartera falla, responde unavailable sin propagar el error", async () => {
    vi.stubEnv("DATA_MODE", "live");
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.isRealAccountRequest.mockReturnValue(true);
    mocks.portfolioGet.mockRejectedValue(new Error("rpc caído"));

    await expect(loadPortfolioForAssistant(REQ)).resolves.toEqual({ kind: "unavailable" });
    expect(mocks.portfolioGet).toHaveBeenCalledWith("W1");
  });

  it("sin sesión pide iniciar sesión y no consulta la cartera", async () => {
    vi.stubEnv("DATA_MODE", "live");
    mocks.getSession.mockResolvedValue(null);
    mocks.isRealAccountRequest.mockReturnValue(true);

    await expect(loadPortfolioForAssistant(REQ)).resolves.toEqual({ kind: "sign-in" });
    expect(mocks.portfolioGet).not.toHaveBeenCalled();
    expect(mocks.demoGetPortfolio).not.toHaveBeenCalled();
  });
});

describe("RichAssistantMessage", () => {
  const SAMPLE = "Apple cotiza así y NVDAx sube hoy.";

  it("conserva la frase completa y enlaza el ticker a su ficha", () => {
    const markup = html(createElement(RichAssistantMessage, { text: SAMPLE }));

    expect(plainText(markup)).toContain(SAMPLE);
    expect(markup).toContain('href="/app/accion/NVDAx"');
    expect(markup).toContain("NVDAx");
  });

  it("no inventa enlaces de ticker cuando el texto no los tiene", () => {
    const markup = html(createElement(RichAssistantMessage, { text: "Hola, ¿en qué te ayudo?" }));

    expect(plainText(markup)).toContain("Hola, ¿en qué te ayudo?");
    expect(markup).not.toContain("/app/accion/");
    expect(markup).toContain("No es recomendación de inversión");
  });
});

describe("GrokThinkingCard", () => {
  it("anuncia el estado con role=status y respeta el movimiento reducido", () => {
    const markup = html(createElement(GrokThinkingCard, { label: "Escribiendo" }));

    expect(plainText(markup)).toContain("Escribiendo");
    expect(markup).toContain('role="status"');
    expect(markup).toContain("motion-safe:animate-pulse");
    expect(markup).toContain("motion-reduce:animate-none");
  });

  it("etiqueta el modo de razonamiento cuando se le pasa", () => {
    const markup = html(createElement(GrokThinkingCard, { label: "Analizando", mode: "deep" }));

    expect(plainText(markup)).toContain("Analizando");
    expect(plainText(markup)).toContain("DeepThink");
  });
});

describe("MarketPulseBar", () => {
  const PULSE_PROMPTS = [
    "Analiza cómo va NVDAx hoy, su tendencia y riesgos clave",
    "Compara SPYx y QQQx en el último mes",
    "¿Cómo va mi cartera? Analiza pesos y diversificación",
    "Explica cómo funcionan las acciones tokenizadas xStocks 24/7 en Solana y sus riesgos",
  ] as const;

  it("ofrece los cuatro análisis rápidos y nombra los tickers", () => {
    const markup = html(createElement(MarketPulseBar, { onSelectPrompt: () => {} }));
    const visible = plainText(markup);

    expect(new Set(PULSE_PROMPTS).size).toBe(4);
    for (const prompt of PULSE_PROMPTS) {
      expect(markup).toContain(prompt);
    }
    for (const ticker of ["NVDAx", "SPYx", "QQQx"]) {
      expect(visible).toContain(ticker);
    }
    expect(markup.match(/<button/g) ?? []).toHaveLength(4);
  });
});

describe("ReasoningModeBar", () => {
  it("muestra Flash, DeepThink y Cartera X-Ray con un solo modo activo", () => {
    const markup = html(createElement(ReasoningModeBar, { mode: "deep", onChange: () => {} }));
    const visible = plainText(markup);

    for (const label of ["Flash", "DeepThink", "Cartera X-Ray"]) {
      expect(visible).toContain(label);
    }
    expect(markup.match(/aria-pressed="true"/g) ?? []).toHaveLength(1);
    expect(markup.match(/aria-pressed="false"/g) ?? []).toHaveLength(2);
  });

  it("sólo DeepThink antepone su prefijo y nunca supera MAX_TEXT", () => {
    expect(applyReasoningPrefix("hola", "flash")).toBe("hola");
    expect(applyReasoningPrefix("hola", "flash")).not.toContain("DeepThink");

    const deep = applyReasoningPrefix("hola", "deep");
    expect(deep).toContain("hola");
    expect(deep.toLowerCase()).toContain("deepthink");
    expect(deep.length).toBeLessThanOrEqual(MAX_TEXT);
    // Idempotente: aplicarlo dos veces no duplica el prefijo.
    expect(applyReasoningPrefix(deep, "deep")).toBe(deep);

    const longText = "a".repeat(MAX_TEXT + 50);
    expect(applyReasoningPrefix(longText, "deep").length).toBeLessThanOrEqual(MAX_TEXT);
    expect(applyReasoningPrefix(longText, "portfolio").length).toBeLessThanOrEqual(MAX_TEXT);
  });
});

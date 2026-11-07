import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OnchainVerificationCard } from "@/components/domain/onchain-verification-card";
import { PortfolioHealthCard } from "@/components/domain/portfolio-health-card";
import { SecurityShieldCard } from "@/components/domain/security-shield-card";
import { TradeReceiptTrigger } from "@/components/domain/trade-receipt-modal";
import { CostSimulator } from "@/components/landing/cost-simulator";
import { PublicCatalogGrid } from "@/components/landing/public-catalog-grid";
import type { Position } from "@/lib/types";

describe("T49: pulido institucional (catálogo público, simulador de costos, comprobante, salud de cartera y seguridad)", () => {
  it("PublicCatalogGrid renderiza los activos con enlaces a /acciones/[slug], nombre y ticker", () => {
    const html = renderToStaticMarkup(
      createElement(PublicCatalogGrid, {
        assets: [
          { slug: "apple", name: "Apple", ticker: "AAPL", symbol: "AAPLx", etf: false },
          { slug: "sp-500", name: "S&P 500 ETF", ticker: "SPY", symbol: "SPYx", etf: true },
        ],
      }),
    );
    expect(html).toContain("/acciones/apple");
    expect(html).toContain("/acciones/sp-500");
    expect(html).toContain("Apple");
    expect(html).toContain("AAPL");
    expect(html).toContain("SPYx");
    expect(html).toContain("Todos (2)");
  });

  it("CostSimulator renderiza monto inicial US$100, comisión 0% y desglose de red Solana", () => {
    const html = renderToStaticMarkup(createElement(CostSimulator));
    expect(html).toContain("US$100");
    expect(html).toContain("0%");
    expect(html).toContain("Solana");
  });

  it("PortfolioHealthCard distingue cartera diversificada, alta concentración y cartera vacía", () => {
    const empty = renderToStaticMarkup(
      createElement(PortfolioHealthCard, {
        positions: [],
        cashUsdc: 100,
        totalUsd: 100,
      }),
    );
    expect(empty).toBe("");

    const diversifiedPositions: Position[] = [
      {
        symbol: "AAPLx",
        multiplier: 1,
        shares: 1,
        priceUsd: 300,
        valueUsd: 300,
        avgCostUsd: 280,
        pnlUsd: 20,
        pnlPct: 20 / 280,
        allocationPct: 0.3,
      },
      {
        symbol: "NVDAx",
        multiplier: 1,
        shares: 1,
        priceUsd: 300,
        valueUsd: 300,
        avgCostUsd: 250,
        pnlUsd: 50,
        pnlPct: 50 / 250,
        allocationPct: 0.3,
      },
      {
        symbol: "SPYx",
        multiplier: 1,
        shares: 1,
        priceUsd: 300,
        valueUsd: 300,
        avgCostUsd: 290,
        pnlUsd: 10,
        pnlPct: 10 / 290,
        allocationPct: 0.3,
      },
    ];
    const diversifiedHtml = renderToStaticMarkup(
      createElement(PortfolioHealthCard, {
        positions: diversifiedPositions,
        cashUsdc: 100,
        totalUsd: 1000,
      }),
    );
    expect(diversifiedHtml).toContain("Cartera diversificada");
    expect(diversifiedHtml).toContain("Invertido 90%");

    const concentratedHtml = renderToStaticMarkup(
      createElement(PortfolioHealthCard, {
        positions: [
          {
            symbol: "NVDAx",
            multiplier: 1,
            shares: 1,
            priceUsd: 800,
            valueUsd: 800,
            avgCostUsd: 700,
            pnlUsd: 100,
            pnlPct: 100 / 700,
            allocationPct: 0.8,
          },
        ],
        cashUsdc: 200,
        totalUsd: 1000,
      }),
    );
    expect(concentratedHtml).toContain("Alta concentración en NVDAx");
  });

  it("TradeReceiptTrigger renderiza el botón de comprobante", () => {
    const html = renderToStaticMarkup(
      createElement(TradeReceiptTrigger, {
        id: "ord_1234567890",
        kind: "buy",
        symbol: "AAPLx",
        tickerName: "Apple",
        shares: 0.5,
        usd: 100,
        at: "2026-11-06T12:00:00.000Z",
        status: "confirmed",
        signature: "5KtPn1LGuxhFiwjxErkxTb3X9sLm",
        currency: "USD",
      }),
    );
    expect(html).toContain("Comprobante");
  });

  it("OnchainVerificationCard muestra respaldo 1:1, enlace a Solscan y radiografía IA", () => {
    const html = renderToStaticMarkup(
      createElement(OnchainVerificationCard, {
        symbol: "NVDAx",
        name: "NVIDIA",
        mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
        issuer: "Backed Finance (xStocks)",
        underlying: "NVDA",
        multiplier: 1.0025,
      }),
    );
    expect(html).toContain("SPL Verificable · 1:1");
    expect(html).toContain("solscan.io/token/Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
    expect(html).toContain("Radiografía IA de NVDAx");
  });

  it("SecurityShieldCard muestra protección activa, límites de retiro y enlace a seguridad", () => {
    const html = renderToStaticMarkup(
      createElement(SecurityShieldCard, {
        email: "usuario@ejemplo.cl",
        mode: "real",
      }),
    );
    expect(html).toContain("Centro de Confianza y Protección");
    expect(html).toContain("Protección activa");
    expect(html).toContain("usuario@ejemplo.cl");
    expect(html).toContain("US$500");
    expect(html).toContain("/app/perfil/seguridad");
  });
});

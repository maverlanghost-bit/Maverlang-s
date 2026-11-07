/**
 * T51 — tanda institucional: vista previa de impacto de la orden, resumen
 * patrimonial (cartola), verificación de dirección Solana y credencial del
 * inversionista.
 *
 * El environment de vitest es "node", así que todo se renderiza con
 * `renderToStaticMarkup` y este archivo es `.ts`: se usa `createElement`, nunca
 * JSX. Los componentes viven en archivos `"use client"`, pero se pueden
 * renderizar a string sin montar nada (no hay effects ni estado propio).
 *
 * `next/link` necesita el router de la app; en SSR de test se reemplaza por un
 * ancla plana.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({
      href,
      children,
      ...props
    }: {
      href: string;
      children?: React.ReactNode;
      className?: string;
      "aria-label"?: string;
    }) => React.createElement("a", { href, ...props }, children),
  };
});

/**
 * `CsvExportButton` se aísla a propósito: usa `useT()` → `usePrefs()` →
 * `useQuery()` de TanStack Query, que lanza sin `QueryClientProvider`, y además
 * `useSyncExternalStore`. En este test sólo interesa el contenido del resumen
 * patrimonial, no el botón de exportación, así que se reemplaza por `null`.
 */
vi.mock("@/components/domain/csv-export-button", () => ({
  CsvExportButton: () => null,
}));

import { AddressVerificationBadge } from "@/components/wallet/address-verification-badge";
import { InvestorPassportCard } from "@/components/domain/investor-passport-card";
import { PortfolioTaxSummaryCard } from "@/components/domain/portfolio-tax-summary-card";
import { TradeImpactPreview } from "@/components/domain/trade-impact-preview";
import { formatMoney, formatShares } from "@/lib/format";
import type { Activity, Position } from "@/lib/types";

/**
 * `renderToStaticMarkup` separa nodos de texto hermanos con `<!-- -->`; se
 * quitan para poder afirmar sobre frases contiguas.
 */
function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--.*?-->/g, "");
}

describe("TradeImpactPreview", () => {
  it("resume posición, peso en cartera y efectivo después de la compra", () => {
    const markup = render(
      createElement(TradeImpactPreview, {
        side: "buy",
        symbol: "AAPLx",
        currentShares: 1,
        deltaShares: 0.5,
        currentValueUsd: 200,
        orderUsd: 100,
        totalPortfolioUsd: 1000,
        cashUsdc: 300,
        currency: "USD",
      }),
    );

    expect(markup).toContain("Impacto estimado en tu cartera");
    expect(markup).toContain("Jupiter Spot Router · 0% comisión");
    expect(markup).toContain("Posición AAPLx");
    // `formatShares` añade el sufijo " acc.": 1 → 1,5 se pinta como
    // "1 acc. → 1,5 acc." (una sola interpolación, sin separadores de React).
    expect(markup).toContain(`${formatShares(1)} → ${formatShares(1.5)}`);
    expect(markup).toContain("1,5 acc.");
    // Peso: 200/1000 = 20 % → (200 + 100)/1000 = 30 %.
    expect(markup).toContain("20% → 30%");
    // Efectivo: 300 − 100 = 200 USD, con el formateador de la app.
    expect(markup).toContain("Efectivo post-orden");
    expect(markup).toContain(formatMoney(200, "USD"));
  });
});

describe("PortfolioTaxSummaryCard", () => {
  const symbol: Position["symbol"] = "AAPLx";

  const position: Position = {
    symbol: "AAPLx" as Position["symbol"],
    shares: 2,
    multiplier: 1,
    avgCostUsd: 100,
    priceUsd: 120,
    valueUsd: 240,
    pnlUsd: 40,
    pnlPct: 20,
    allocationPct: 100,
  };

  const buy: Activity = {
    id: "act_buy_1",
    kind: "buy",
    symbol,
    amountUi: 2,
    valueUsd: 200,
    status: "confirmed",
    signature: null,
    at: "2026-11-01T12:00:00.000Z",
  };

  const sell: Activity = {
    id: "act_sell_1",
    kind: "sell",
    symbol,
    amountUi: 1,
    valueUsd: 50,
    status: "confirmed",
    signature: null,
    at: "2026-11-02T12:00:00.000Z",
  };

  it("suma costo base, resultado abierto y movimientos confirmados", () => {
    const markup = render(
      createElement(PortfolioTaxSummaryCard, {
        positions: [position],
        activities: [buy, sell],
        currency: "USD",
      }),
    );

    expect(markup).toContain("Resumen Patrimonial y Cartola Anual");
    // Costo base: 100 USD × 2 acciones = 200 USD.
    expect(markup).toContain("Costo base en cartera");
    expect(markup).toContain(formatMoney(200, "USD"));
    // Resultado abierto: 40 USD no realizados.
    expect(markup).toContain("Resultado abierto (no realizado)");
    expect(markup).toContain(formatMoney(40, "USD"));
    expect(markup).toContain("Compras confirmadas (1)");
    expect(markup).toContain("Ventas confirmadas (1)");
    expect(markup).toContain(formatMoney(50, "USD"));
    // El descargo tributario sigue marcado como borrador legal.
    expect(markup).toContain("[REVISIÓN ABOGADO]");
  });
});

describe("AddressVerificationBadge", () => {
  const address = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";

  it("confirma una dirección Ed25519 válida y enlaza a Solscan", () => {
    const markup = render(createElement(AddressVerificationBadge, { address, valid: true }));

    expect(markup).toContain("✓ Dirección Solana Ed25519 válida (Base58)");
    expect(markup).toContain("solscan.io/account/");
    expect(markup).toContain(encodeURIComponent(address));
    expect(markup).toContain('role="status"');
  });

  it("avisa formato Base58 inválido y no pinta nada con la dirección en blanco", () => {
    const invalid = render(createElement(AddressVerificationBadge, { address, valid: false }));
    expect(invalid).toContain("Formato Base58 inválido");
    expect(invalid).not.toContain("solscan.io/account/");

    // Sólo espacios: `trim()` deja la cadena vacía y el componente devuelve null.
    expect(render(createElement(AddressVerificationBadge, { address: "   ", valid: true }))).toBe("");
  });
});

describe("InvestorPassportCard", () => {
  it("muestra iniciales, correo, elegibilidad y jurisdicción declarada", () => {
    const markup = render(
      createElement(InvestorPassportCard, {
        displayName: "Manuel Rojas",
        email: "manuel@example.com",
        country: "CL",
        userId: "user_123",
      }),
    );

    expect(markup).toContain("MR");
    expect(markup).toContain("Manuel Rojas");
    expect(markup).toContain("manuel@example.com");
    expect(markup).toContain("Elegibilidad Verificada · No US-Person");
    expect(markup).toContain("CL · Operación habilitada");
    expect(markup).toContain("user_123");
  });
});

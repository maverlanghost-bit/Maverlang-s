/**
 * T50 — pulido de diseño institucional: medidor de clave, termómetro de rango,
 * cabecera de la bóveda, cinta de índices y píldoras de máximos/mínimos del
 * gráfico.
 *
 * El environment de vitest es "node", así que todo se renderiza con
 * `renderToStaticMarkup` y este archivo es `.ts`: se usa `createElement`, nunca
 * JSX. Los componentes viven en archivos `"use client"`, pero se pueden
 * renderizar a string sin montar nada (no hay effects ni contexto de sesión).
 *
 * `next/link` necesita el router de la app; en SSR de test se reemplaza por un
 * ancla plana para poder afirmar sobre `href` sin montar contexto de Next.
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

import { PasswordStrengthMeter, passwordStrengthLabel } from "@/components/auth/password-strength-meter";
import { MarketIndexStrip } from "@/components/domain/market-index-strip";
import { PriceRangeBar } from "@/components/domain/price-range-bar";
import { SvgPriceChart, type PriceChartProps } from "@/components/domain/svg-price-chart";
import { WalletVaultHeader } from "@/components/domain/wallet-vault-header";
import { formatMoney } from "@/lib/format";
import { displayPrice } from "@/lib/market/browse";
import type { Quote } from "@/lib/types";

/**
 * `renderToStaticMarkup` separa nodos de texto hermanos con `<!-- -->`; se
 * quitan para poder afirmar sobre frases contiguas ("Nivel: Fuerte").
 */
function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--.*?-->/g, "");
}

/** Cotización neutra: sólo se rellenan los campos que exige `Quote`. */
function makeQuote(symbol: string, priceUsd: number, change24hPct: number): Quote {
  return {
    symbol,
    priceUsd,
    change24hPct,
    multiplier: 1,
    updatedAt: "2026-11-06T12:00:00.000Z",
    source: "mock",
  };
}

describe("PasswordStrengthMeter y passwordStrengthLabel", () => {
  it("clasifica clave vacía, corta, aceptable y fuerte", () => {
    expect(passwordStrengthLabel("")).toBeNull();
    // Menos de 8 caracteres: no alcanza el mínimo.
    expect(passwordStrengthLabel("Ab1")).toBe("Muy corta");
    expect(passwordStrengthLabel("abcdef1")).toBe("Muy corta");
    // Letras y números, pero sin llegar a 12: aceptable.
    expect(passwordStrengthLabel("abcdefgh1")).toBe("Aceptable");
    // 12+ caracteres sin dígitos tampoco es fuerte.
    expect(passwordStrengthLabel("Abcdefghijkl")).toBe("Aceptable");
    // 12+ caracteres con letras y números: fuerte.
    expect(passwordStrengthLabel("CorrectaClave12")).toBe("Fuerte");
  });

  it("pinta el nivel, la barra y la lista de requisitos", () => {
    const markup = render(createElement(PasswordStrengthMeter, { password: "CorrectaClave12" }));

    expect(markup).toContain("Seguridad de la clave");
    expect(markup).toContain("Nivel: Fuerte");
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    // Checklist de requisitos, con el texto exacto del componente.
    expect(markup).toContain("8+ caracteres");
    expect(markup).toContain("Letras y números");
    expect(markup).toContain("12+ caracteres");
  });

  it("avisa Muy corta y no pinta nada sin clave", () => {
    expect(render(createElement(PasswordStrengthMeter, { password: "abc" }))).toContain("Nivel: Muy corta");
    expect(render(createElement(PasswordStrengthMeter, { password: "abcdefgh1" }))).toContain("Nivel: Aceptable");
    expect(render(createElement(PasswordStrengthMeter, { password: "" }))).toBe("");
  });
});

describe("PriceRangeBar", () => {
  const rangeProps = {
    lowUsd: 100,
    highUsd: 150,
    currentUsd: 125,
    rangeLabel: "7 días",
    currency: "USD",
  } as const;

  it("muestra el período, los precios formateados y la amplitud del rango", () => {
    const markup = render(createElement(PriceRangeBar, rangeProps));

    expect(markup).toContain("Termómetro del período");
    expect(markup).toContain("7 días");
    // (150 − 100) / 100 = 50,00 % con coma decimal.
    expect(markup).toContain("Amplitud +50,00%");
    // (125 − 100) / (150 − 100) = 50 % del rango.
    expect(markup).toContain("Posición");
    expect(markup).toContain("50%");

    // Los tres precios usan el mismo formateador que el resto de la app.
    const lowText = formatMoney(displayPrice(rangeProps.lowUsd, "USD", undefined) ?? rangeProps.lowUsd, "USD");
    const highText = formatMoney(displayPrice(rangeProps.highUsd, "USD", undefined) ?? rangeProps.highUsd, "USD");
    const currentText = formatMoney(displayPrice(rangeProps.currentUsd, "USD", undefined) ?? rangeProps.currentUsd, "USD");
    expect(markup).toContain(lowText);
    expect(markup).toContain(highText);
    expect(markup).toContain(currentText);
    // Etiquetas del pie del termómetro.
    expect(markup).toContain("Mín");
    expect(markup).toContain("Actual");
    expect(markup).toContain("Máx");
  });

  it("no pinta nada si el rango es inválido o falta un precio", () => {
    // Máximo igual al mínimo: no hay amplitud que dibujar.
    expect(render(createElement(PriceRangeBar, { ...rangeProps, highUsd: 100 }))).toBe("");
    // Máximo por debajo del mínimo.
    expect(render(createElement(PriceRangeBar, { ...rangeProps, highUsd: 90 }))).toBe("");
    // Sin precio actual no hay posición en el rango.
    expect(render(createElement(PriceRangeBar, { ...rangeProps, currentUsd: null }))).toBe("");
    expect(render(createElement(PriceRangeBar, { ...rangeProps, lowUsd: undefined }))).toBe("");
  });
});

describe("WalletVaultHeader", () => {
  it("resume la bóveda con el tanque de gas en Óptimo", () => {
    const markup = render(createElement(WalletVaultHeader, { solUi: 0.2, lowSol: false, mode: "demo" }));

    expect(markup).toContain("Bóveda Autocustodia · Solana SPL");
    expect(markup).toContain("Gas Tank SOL:");
    expect(markup).toContain("Óptimo");
    expect(markup).not.toContain("Bajo");
    expect(markup).toContain("Modo demo");
  });

  it("avisa Bajo cuando la reserva de SOL no alcanza", () => {
    const markup = render(createElement(WalletVaultHeader, { solUi: 0.001, lowSol: true, mode: "real" }));

    expect(markup).toContain("Bóveda Autocustodia · Solana SPL");
    expect(markup).toContain("Gas Tank SOL:");
    expect(markup).toContain("Bajo");
    expect(markup).not.toContain("Óptimo");
    expect(markup).toContain("Cuenta real");
  });
});

describe("MarketIndexStrip", () => {
  const quotes: ReadonlyMap<string, Quote> = new Map<string, Quote>([
    ["SPYx", makeQuote("SPYx", 612.34, 0.0075)],
    ["NVDAx", makeQuote("NVDAx", 178.9, -0.0121)],
  ]);

  it("lista los benchmarks disponibles con su enlace y el dólar de referencia", () => {
    const markup = render(createElement(MarketIndexStrip, { quotes, currency: "USD", rate: 950 }));

    expect(markup).toContain("Pulso 24/7");
    expect(markup).toContain("Termómetros del mercado");
    // Sólo se enlazan los benchmarks presentes en el mapa de cotizaciones.
    expect(markup).toContain('href="/app/accion/SPYx"');
    expect(markup).toContain('href="/app/accion/NVDAx"');
    expect(markup).not.toContain("/app/accion/QQQx");
    expect(markup).toContain("S&amp;P 500");
    expect(markup).toContain("NVIDIA");
    expect(markup).toContain("Dólar ref.");
    expect(markup).toContain(formatMoney(950, "CLP"));
  });

  it("sin tipo de cambio no muestra el dólar de referencia", () => {
    const markup = render(createElement(MarketIndexStrip, { quotes, currency: "USD", rate: undefined }));

    expect(markup).toContain("Pulso 24/7");
    expect(markup).not.toContain("Dólar ref.");
  });

  it("sin benchmarks ni tipo de cambio no ocupa espacio", () => {
    const empty: ReadonlyMap<string, Quote> = new Map<string, Quote>();
    expect(render(createElement(MarketIndexStrip, { quotes: empty, currency: "USD", rate: undefined }))).toBe("");
  });
});

describe("SvgPriceChart (extremos del período)", () => {
  const chartProps = {
    tone: "up",
    label: "Precio del período",
    emptyLabel: "Sin datos de precio",
    onHover: () => {},
  } satisfies Omit<PriceChartProps, "points">;

  const DISTINCT_POINTS = [
    { t: Date.UTC(2026, 9, 1), p: 100 },
    { t: Date.UTC(2026, 9, 2), p: 132 },
    { t: Date.UTC(2026, 9, 3), p: 96 },
    { t: Date.UTC(2026, 9, 4), p: 121 },
  ] as const;

  it("marca el máximo y el mínimo del período sobre el gráfico", () => {
    const markup = render(createElement(SvgPriceChart, { ...chartProps, points: DISTINCT_POINTS }));

    expect(markup).toContain('data-chart-extreme="high"');
    expect(markup).toContain('data-chart-extreme="low"');
    expect(markup).toContain("Máx");
    expect(markup).toContain("Mín");
    // Ambos badges son decorativos: el detalle accesible vive en el SVG.
    expect(markup).toContain('aria-hidden="true"');
  });
});

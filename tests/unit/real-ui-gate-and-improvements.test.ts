/**
 * T46 — interruptor de la UI de cuenta real y mejoras de UI (simulador, mapa de
 * calor, donut de cartera y exportación CSV).
 *
 * El environment de vitest es "node", así que todo se renderiza con
 * `renderToStaticMarkup` y este archivo es `.ts`: se usa `createElement`, nunca
 * JSX. Los componentes que leen `useT()` arrastran react-query y el contexto de
 * sesión, por eso el hook se mockea con el diccionario es-CL y no se monta
 * ningún provider (ni QueryClient ni sesión).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `next/link` necesita el router de la app; en SSR de test se reemplaza por un
// ancla plana para poder afirmar sobre `href` sin montar contexto de Next.
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

// Igual con `next/image`: sin el loader de Next, se pinta un <img> simple.
vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: (props: { src?: string; alt?: string; className?: string }) =>
      React.createElement("img", { src: props.src, alt: props.alt, className: props.className }),
  };
});

// `useT` real depende de useDisplayLanguage/useDisplayCurrency (react-query +
// sesión). El mock devuelve el diccionario es-CL y CLP, que es el caso por
// defecto del producto. Se importa es-CL dentro del factory para no chocar con
// el hoisting de `vi.mock` (TDZ de las constantes del módulo de test).
vi.mock("@/lib/hooks/use-t", async () => {
  const { esCL } = await import("@/content/i18n/es-CL");
  return {
    useT: () => ({ t: esCL, language: "es-CL" as const, currency: "CLP" as const }),
  };
});

import { CsvExportButton } from "@/components/domain/csv-export-button";
import { MarketHeatmap } from "@/components/domain/market-heatmap";
import { PortfolioDonut } from "@/components/domain/portfolio-donut";
import { WhatIfCalculator } from "@/components/domain/what-if-calculator";
import { esCL } from "@/content/i18n/es-CL";
import { isRealAccountUiBlocked, isRealAccountUiEnabled } from "@/lib/account/real-ui-gate";
import { formatPercent, formatPortion } from "@/lib/format";
import { useT } from "@/lib/hooks/use-t";
import type { Activity, PricePoint } from "@/lib/types";

/** Primera etiqueta <button ...> del markup, para mirar sus atributos. */
function firstButtonTag(markup: string): string {
  return markup.match(/<button\b[^>]*>/)?.[0] ?? "";
}

describe("mock de useT", () => {
  it("entrega el diccionario es-CL y la moneda CLP sin providers", () => {
    const context = useT();
    expect(context.t).toBe(esCL);
    expect(context.language).toBe("es-CL");
    expect(context.currency).toBe("CLP");
  });
});

describe("interruptor de la UI de cuenta real", () => {
  const ENV_KEY = "NEXT_PUBLIC_REAL_ACCOUNT_ENABLED";
  const savedEnv = process.env[ENV_KEY];

  // Cada caso parte sin la variable: el default es "cuenta real bloqueada".
  beforeEach(() => {
    delete process.env[ENV_KEY];
  });

  // Restaura el valor original del proceso para no filtrar estado a otros tests.
  afterEach(() => {
    if (savedEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = savedEnv;
  });

  it("por defecto la cuenta real está apagada y sólo bloquea el modo real", () => {
    expect(process.env[ENV_KEY]).toBeUndefined();
    expect(isRealAccountUiEnabled()).toBe(false);
    expect(isRealAccountUiBlocked("real")).toBe(true);
    expect(isRealAccountUiBlocked("demo")).toBe(false);
  });

  it('con "true" se habilita y el modo real deja de estar bloqueado', () => {
    process.env[ENV_KEY] = "true";
    expect(isRealAccountUiEnabled()).toBe(true);
    expect(isRealAccountUiBlocked("real")).toBe(false);
    expect(isRealAccountUiBlocked("demo")).toBe(false);
  });

  it("cualquier otro valor se considera apagado (el switch es explícito)", () => {
    for (const value of ["1", "TRUE", "yes", "false", ""]) {
      process.env[ENV_KEY] = value;
      expect(isRealAccountUiEnabled()).toBe(false);
      expect(isRealAccountUiBlocked("real")).toBe(true);
    }
  });
});

// Dos precios separados en el tiempo: 100 USD al inicio, 120 USD hoy.
const WHAT_IF_POINTS: readonly PricePoint[] = [
  { t: Date.UTC(2025, 0, 2, 15, 0), p: 100 },
  { t: Date.UTC(2025, 5, 2, 15, 0), p: 120 },
];

const whatIfBase = {
  symbol: "AAPLx",
  name: "Apple Inc.",
  points: WHAT_IF_POINTS,
  currentPriceUsd: 120,
  currency: "CLP",
  rate: 950,
} satisfies Parameters<typeof WhatIfCalculator>[0];

function whatIfMarkup(props: Parameters<typeof WhatIfCalculator>[0]): string {
  return renderToStaticMarkup(createElement(WhatIfCalculator, props));
}

describe("WhatIfCalculator", () => {
  it("muestra nombre, símbolo, presets y las tres métricas del simulador", () => {
    const markup = whatIfMarkup(whatIfBase);

    expect(markup).toContain("Simulador");
    expect(markup).toContain("Apple Inc.");
    expect(markup).toContain("AAPLx");
    // Presets de monto en pesos (CLP + tipo de cambio disponible).
    expect(markup).toContain("Monto inicial");
    expect(markup).toContain("Elige un monto inicial");
    // Etiquetas estables de las métricas.
    expect(markup).toContain("Invertido");
    expect(markup).toContain("Valor hoy");
    expect(markup).toContain("Acciones compradas");
    expect(markup).toContain("Ganancia / pérdida");
    // El resultado va con signo y moneda: en este caso es una ganancia en CLP.
    expect(markup).toContain("+$");
    // Precios de entrada y actual, y el aviso de que no es una proyección.
    expect(markup).toContain("Entrada");
    expect(markup).toContain("Hoy");
    expect(markup).toContain("Los rendimientos pasados no aseguran resultados futuros");
  });

  it("sin dos precios o sin precio actual no pinta nada", () => {
    // Un solo punto: no hay período que simular.
    expect(whatIfMarkup({ ...whatIfBase, points: [{ t: Date.UTC(2025, 0, 2), p: 100 }] })).toBe("");
    // Sin historial tampoco.
    expect(whatIfMarkup({ ...whatIfBase, points: [] })).toBe("");
    // Sin precio actual no se puede valorizar la posición.
    expect(whatIfMarkup({ ...whatIfBase, currentPriceUsd: null })).toBe("");
    // Un precio inicial inválido evita dividir por cero.
    expect(
      whatIfMarkup({
        ...whatIfBase,
        points: [
          { t: Date.UTC(2025, 0, 2), p: 0 },
          { t: Date.UTC(2025, 5, 2), p: 120 },
        ],
      }),
    ).toBe("");
  });
});

// Contrato del mapa de calor: filas ya formateadas por la página. El símbolo es
// el del catálogo (xStocks termina en "x"), igual que en la ruta de la ficha.
const HEATMAP_ROWS = [
  { symbol: "AAPLx", name: "Apple Inc.", priceUsd: 189.5, change24hPct: 0.0123, priceFormatted: "US$189,50" },
  { symbol: "TSLAx", name: "Tesla, Inc.", priceUsd: 242.1, change24hPct: -0.021, priceFormatted: "US$242,10" },
] as const;

describe("MarketHeatmap", () => {
  it("lista las filas con símbolo, nombre, precio formateado y enlace a la ficha", () => {
    const markup = renderToStaticMarkup(createElement(MarketHeatmap, { rows: HEATMAP_ROWS }));

    expect(markup).toContain("AAPLx");
    expect(markup).toContain("Apple Inc.");
    expect(markup).toContain("TSLAx");
    expect(markup).toContain("Tesla, Inc.");
    // El precio llega ya formateado: el componente no lo vuelve a calcular.
    expect(markup).toContain("US$189,50");
    expect(markup).toContain("US$242,10");
    // Cada fila enlaza a la ficha con el sufijo x del xStock.
    expect(markup).toContain('href="/app/accion/AAPLx"');
    expect(markup).toContain('href="/app/accion/TSLAx"');
    // El contenedor se anuncia como lista con nombre accesible.
    expect(markup).toContain('role="list"');
    expect(markup).toContain('aria-label="Mapa de calor del mercado"');
    // Cada tarjeta resume símbolo, nombre, variación y precio en su aria-label.
    // `change24hPct` es un ratio (igual que `Quote`); formatPercent lo recibe tal cual.
    const rowLabel = `${HEATMAP_ROWS[0].symbol}, ${HEATMAP_ROWS[0].name}: ${formatPercent(
      HEATMAP_ROWS[0].change24hPct,
    )}, ${HEATMAP_ROWS[0].priceFormatted}`;
    expect(markup).toContain(`aria-label="${rowLabel}"`);
  });

  it("sin filas muestra el estado vacío en vez de una grilla vacía", () => {
    const markup = renderToStaticMarkup(createElement(MarketHeatmap, { rows: [] }));

    expect(markup).toContain("Sin datos para el mapa de calor.");
    // Sin filas no hay enlaces a fichas ni precios.
    expect(markup).not.toContain("/app/accion/");
    expect(markup).not.toContain("US$189,50");
    expect(markup).not.toContain('role="list"');
  });
});

const DONUT_SLICES = [
  { key: "AAPL", label: "Apple", pct: 0.6, valueLabel: "US$600,00", color: "#1d4ed8" },
  { key: "TSLA", label: "Tesla", pct: 0.4, valueLabel: "US$400,00", color: "#b91c1c" },
] as const;

describe("PortfolioDonut", () => {
  it("describe la composición en el aria-label y dibuja un círculo por segmento", () => {
    const markup = renderToStaticMarkup(createElement(PortfolioDonut, { slices: DONUT_SLICES }));

    expect(markup).toContain('role="img"');
    // El resumen del aria-label usa "etiqueta + formatPortion(pct)" por segmento.
    const summary = DONUT_SLICES.map((slice) => `${slice.label} ${formatPortion(slice.pct)}`).join(", ");
    expect(markup).toContain(`aria-label="Composición de tu cartera: ${summary}"`);
    expect(markup).toContain(`Apple ${formatPortion(0.6)}`);
    expect(markup).toContain(`Tesla ${formatPortion(0.4)}`);

    // Un círculo de fondo + un círculo por segmento, cada uno con su color.
    expect(markup.split("<circle").length - 1).toBe(DONUT_SLICES.length + 1);
    expect(markup).toContain('stroke="#1d4ed8"');
    expect(markup).toContain('stroke="#b91c1c"');
    // El detalle de cada porción viaja en el <title> del segmento.
    expect(markup).toContain(`${DONUT_SLICES[0].label}: ${formatPortion(DONUT_SLICES[0].pct)} · ${DONUT_SLICES[0].valueLabel}`);
  });

  it("sin porciones no renderiza el anillo", () => {
    expect(renderToStaticMarkup(createElement(PortfolioDonut, { slices: [] }))).toBe("");
  });
});

const CSV_ROWS: readonly Activity[] = [
  {
    id: "act-1",
    kind: "buy",
    symbol: "AAPLx",
    amountUi: 1.5,
    valueUsd: 300,
    status: "confirmed",
    signature: null,
    at: "2026-01-05T14:30:00.000Z",
  },
];

const csvBase = {
  rows: CSV_ROWS,
  currency: "CLP",
  fxRate: 950,
} satisfies Parameters<typeof CsvExportButton>[0];

function csvMarkup(props: Parameters<typeof CsvExportButton>[0]): string {
  return renderToStaticMarkup(createElement(CsvExportButton, props));
}

describe("CsvExportButton", () => {
  it("en SSR queda deshabilitado y conserva su etiqueta", () => {
    const markup = csvMarkup(csvBase);
    const tag = firstButtonTag(markup);

    expect(tag).not.toBe("");
    // Sin montar no hay `document` ni `URL.createObjectURL`: el botón no exporta.
    expect(tag).toMatch(/\sdisabled(?:="")?(?=\s|>)/);
    expect(tag).not.toContain("aria-busy");
    expect(markup).toContain("Exportar CSV");
  });

  it("con la cartola vacía también queda deshabilitado", () => {
    const markup = csvMarkup({ ...csvBase, rows: [] });
    const tag = firstButtonTag(markup);

    expect(tag).not.toBe("");
    expect(tag).toMatch(/\sdisabled(?:="")?(?=\s|>)/);
    expect(markup).toContain("Exportar CSV");
  });
});

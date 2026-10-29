import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: (props: { src?: string; alt?: string }) =>
      React.createElement("img", { src: props.src, alt: props.alt }),
  };
});

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

import { NoticeCard } from "@/components/ai/notices";
import {
  CHART_H,
  CHART_W,
  compareScale,
  normalizeToRatio,
  seriesPath,
} from "@/components/ai/model";
import { BuyWidget, CompareWidget, PortfolioWidget, StockWidget } from "@/components/ai/widgets";
import { asistenteCopy } from "@/content/i18n/extra-asistente";

const copy = asistenteCopy.esCL;

function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("widgets del asistente", () => {
  it("la acción muestra logo, precio, cambio y un trazo", () => {
    const markup = html(
      createElement(StockWidget, {
        copy,
        widget: {
          type: "stock",
          ticker: "AAPLx",
          name: "Apple",
          priceUsd: 180.5,
          changePct: 0.0123,
          range: "1D",
          points: [
            { t: 1, p: 170 },
            { t: 2, p: 180.5 },
          ],
        },
      }),
    );
    expect(markup).toContain("Apple");
    expect(markup).toContain("AAPLx");
    expect(markup).toContain("/logos/aapl.png");
    expect(markup).toContain("US$180,50");
    expect(markup).toContain("+1,23%");
    expect(markup).toContain("<svg");
    expect(markup).toContain("M ");
    expect(markup).toContain('href="/app/accion/AAPLx"');
  });

  it("sin precio ni puntos no inventa cifras", () => {
    const markup = html(
      createElement(StockWidget, {
        copy,
        widget: {
          type: "stock",
          ticker: "TSLAx",
          name: "Tesla",
          priceUsd: null,
          changePct: null,
          range: "1W",
          points: [],
        },
      }),
    );
    expect(markup).toContain("Sin precio");
    expect(markup).toContain("Sin dato");
    expect(markup).toContain("Sin gráfico");
    expect(markup).not.toContain("US$");
  });

  it("la comparación parte las series en el mismo punto, en porcentaje", () => {
    const up = normalizeToRatio([
      { t: 1, p: 100 },
      { t: 2, p: 110 },
    ]);
    const down = normalizeToRatio([
      { t: 1, p: 100 },
      { t: 2, p: 90 },
    ]);
    expect(up).toEqual([0, 0.1]);
    expect(down?.[0]).toBe(0);
    expect(down?.[1]).toBeCloseTo(-0.1);
    const scale = compareScale([up ?? [], down ?? []]);
    const upPath = seriesPath(up ?? [], CHART_W, CHART_H, scale.min, scale.max) ?? "";
    const downPath = seriesPath(down ?? [], CHART_W, CHART_H, scale.min, scale.max) ?? "";
    expect(upPath.split(" L ")[0]).toBe(downPath.split(" L ")[0]);
    const markup = html(
      createElement(CompareWidget, {
        copy,
        widget: {
          type: "compare",
          range: "1M",
          items: [
            { ticker: "AAPLx", name: "Apple", changePct: 0.1, points: [{ t: 1, p: 100 }, { t: 2, p: 110 }] },
            { ticker: "MSFTx", name: "Microsoft", changePct: -0.1, points: [{ t: 1, p: 100 }, { t: 2, p: 90 }] },
          ],
        },
      }),
    );
    expect(markup).toContain(upPath);
    expect(markup).toContain(downPath);
    expect(markup).toContain("Apple");
    expect(markup).toContain("Microsoft");
    expect(markup).toContain("+10,00%");
    expect(markup).toContain("-10,00%");
    expect(markup).toContain('role="img"');
  });

  it("la cartera muestra total, resultado y peso", () => {
    const markup = html(
      createElement(PortfolioWidget, {
        copy,
        widget: {
          type: "portfolio",
          totalUsd: 1000,
          pnlPct: -0.02,
          positions: [
            { ticker: "AAPLx", name: "Apple", valueUsd: 250, weightPct: 0.25 },
          ],
        },
      }),
    );
    expect(markup).toContain("Tu cartera");
    expect(markup).toContain("US$1.000,00");
    expect(markup).toContain("-2,00%");
    expect(markup).toContain("US$250,00");
    expect(markup).toContain("25");
    expect(markup).toContain("Valor");
    expect(markup).toContain("Peso");
  });

  it("comprar navega al href y avisa que se confirma en la pantalla", () => {
    const markup = html(
      createElement(BuyWidget, {
        copy,
        widget: {
          type: "buy",
          ticker: "NVDAx",
          name: "NVIDIA",
          href: "/app/accion/NVDAx?operar=comprar",
        },
      }),
    );
    expect(markup).toContain('href="/app/accion/NVDAx?operar=comprar"');
    expect(markup).toContain("Ver para comprar");
    expect(markup).toContain("Vas a confirmar en la pantalla de compra.");
    expect(markup).not.toContain("/api/trade");
  });

  it("un href externo no se vuelve enlace", () => {
    const markup = html(
      createElement(BuyWidget, {
        copy,
        widget: { type: "buy", ticker: "NVDAx", name: "NVIDIA", href: "https://evil.example/buy" },
      }),
    );
    expect(markup).not.toContain("<a ");
    expect(markup).toContain("No hay un enlace de compra.");
  });

  it("sin configurar es una tarjeta tranquila y el fallo ofrece reintento", () => {
    const calm = html(
      createElement(NoticeCard, {
        copy,
        notice: { kind: "not_configured", message: "" },
      }),
    );
    expect(calm).toContain("El asistente aún no está configurado");
    expect(calm).toContain('data-ai-notice="not_configured"');
    expect(calm).not.toContain("Reintentar");

    const failed = html(
      createElement(NoticeCard, {
        copy,
        onRetry: () => {},
        notice: { kind: "upstream", message: "Se cortó la respuesta." },
      }),
    );
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Se cortó la respuesta.");
    expect(failed).toContain("Reintentar");

    const limited = html(
      createElement(NoticeCard, {
        copy,
        notice: { kind: "rate_limited", message: "" },
      }),
    );
    expect(limited).toContain("Demasiadas preguntas");
    expect(limited).toContain("Espera un momento");
  });
});

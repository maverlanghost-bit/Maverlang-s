import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hooks/use-t", () => ({ useT: () => ({ language: "es-CL" }) }));
import { ChartContext } from "@/components/charts/chart-context";

function context(source?: string, range = "1D") {
  return renderToStaticMarkup(createElement(ChartContext, { source, range, points: [] }));
}

describe("contexto del rango 1D", () => {
  it("distingue sondeos del token, referencia del subyacente y demostración", () => {
    expect(context("ticks")).toContain("hasta dos días de sondeos del precio del token");
    expect(context("ticks")).toContain("no corresponde estrictamente a las últimas 24 horas");
    expect(context("closes")).toContain("registros disponibles del subyacente según la resolución de la fuente");
    expect(context("mock")).toContain("ventana de historial de demostración");
    expect(context()).toContain("su fuente no está disponible");
    expect(context("ticks", "1W")).not.toContain("hasta dos días de sondeos");
  });
});

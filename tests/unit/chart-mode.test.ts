import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CHART_MODE_KEY, parseChartMode, useChartMode } from "@/lib/hooks/use-chart-mode";

function Probe() {
  const { mode } = useChartMode();
  return createElement("p", null, mode);
}

describe("modo del gráfico", () => {
  it("sólo acepta technical; todo lo demás es Simple", () => {
    expect(parseChartMode("technical")).toBe("technical");
    expect(parseChartMode("simple")).toBe("simple");
    expect(parseChartMode("Technical")).toBe("simple");
    expect(parseChartMode("tecnico")).toBe("simple");
    expect(parseChartMode("")).toBe("simple");
    expect(parseChartMode(null)).toBe("simple");
    expect(parseChartMode(undefined)).toBe("simple");
  });

  it("el servidor y la hidratación parten en Simple", () => {
    expect(renderToStaticMarkup(createElement(Probe))).toContain("simple");
    expect(CHART_MODE_KEY).toBe("mv:chart-mode");
  });

  it("guarda la clave y aplica el valor después de montar", () => {
    const source = readFileSync(path.join(path.resolve(__dirname, "..", ".."), "lib/hooks/use-chart-mode.ts"), "utf8");
    expect(source).toContain('export const CHART_MODE_KEY = "mv:chart-mode"');
    expect(source).toContain('return "simple"');
    expect(source).toContain("useMounted()");
    expect(source).toContain("mounted ? stored : \"simple\"");
    expect(source).toContain("localStorage.setItem(CHART_MODE_KEY, value)");
  });
});

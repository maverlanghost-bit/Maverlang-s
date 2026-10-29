import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChartLegend, ChartStudyBar, RsiPanel, StudiesSkeleton } from "@/components/domain/chart-overlays";
import { graficoExtra } from "@/content/i18n/extra-grafico";
import { yForRsi } from "@/lib/market/chart-geometry";

const copy = graficoExtra.esCL;

describe("ChartStudyBar", () => {
  it("no pinta nada si no hay datos para ningún indicador", () => {
    const markup = renderToStaticMarkup(createElement(ChartStudyBar, { copy, spy: null, smas: [], rsi: null }));
    expect(markup).toBe("");
  });

  it("muestra los chips en una fila con un solo InfoTip, sin aviso repetido", () => {
    const markup = renderToStaticMarkup(
      createElement(ChartStudyBar, {
        copy,
        spy: { on: true, onToggle: () => {} },
        smas: [
          { period: 20, on: false, onToggle: () => {} },
          { period: 50, on: true, onToggle: () => {} },
        ],
        rsi: { on: false, onToggle: () => {} },
        style: {
          value: "line",
          line: copy.styleLine,
          candles: copy.styleCandles,
          label: copy.styleLabel,
          onChange: () => {},
        },
        volume: { on: false, onToggle: () => {}, label: copy.volume },
      }),
    );
    expect(markup).toContain('aria-label="Indicadores del gráfico"');
    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain("flex-nowrap");
    expect(markup).not.toContain("flex-wrap");
    expect(markup).toContain("whitespace-nowrap");
    expect(markup).toContain("vs S&amp;P 500");
    expect(markup).toContain("SMA 20");
    expect(markup).toContain("SMA 50");
    expect(markup).toContain(">RSI<");
    expect(markup).toContain(">Línea<");
    expect(markup).toContain(">Velas<");
    expect(markup).toContain(">Volumen<");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-label="Sobre los indicadores"');
    expect(markup.split('aria-haspopup="dialog"').length - 1).toBe(1);
    expect(markup).not.toContain("¿Qué es esto?");
    expect(markup).not.toContain("Solo informativo, no es una recomendación");
  });
});

describe("StudiesSkeleton", () => {
  it("reserva la misma fila de 44 px que los chips", () => {
    const markup = renderToStaticMarkup(createElement(StudiesSkeleton, { label: copy.studiesLoading }));
    expect(markup).toContain("h-11");
    expect(markup).toContain("h-8");
    expect(markup).toContain("size-11");
    expect(markup).toContain(copy.studiesLoading);
    expect(markup).toContain('aria-busy="true"');
  });
});

describe("RsiPanel", () => {
  const shared = {
    label: "RSI",
    axisLabel: copy.rsiAxis,
    emptyLabel: copy.rsiEmpty,
  };

  it("dibuja las guías 30 y 70 cuando hay dos puntos", () => {
    const markup = renderToStaticMarkup(
      createElement(RsiPanel, {
        ...shared,
        points: [
          { t: 0, p: 40 },
          { t: 10, p: 60 },
        ],
        t0: 0,
        t1: 10,
      }),
    );
    expect(markup).toContain(`y1="${yForRsi(30)}"`);
    expect(markup).toContain(`y1="${yForRsi(70)}"`);
    expect(markup).toContain('stroke-dasharray="4 4"');
    expect(markup).toContain(">30<");
    expect(markup).toContain(">70<");
    expect(markup).toContain("<path");
    expect(markup).toContain(copy.rsiAxis);
  });

  it("con un solo punto queda el estado vacío, sin línea inventada", () => {
    const markup = renderToStaticMarkup(
      createElement(RsiPanel, {
        ...shared,
        points: [{ t: 0, p: 50 }],
        t0: 0,
        t1: 10,
      }),
    );
    expect(markup).toContain(copy.rsiEmpty);
    expect(markup).not.toContain("<path");
    expect(markup).not.toContain('stroke-dasharray="4 4"');
  });
});

describe("ChartLegend", () => {
  it("lista las series activas", () => {
    const markup = renderToStaticMarkup(
      createElement(ChartLegend, {
        label: copy.legend,
        items: [
          { id: "benchmark", label: "S&P 500", color: "#a3a3a3", dashed: true },
          { id: "sma-20", label: "SMA 20", color: "#2b7fd9" },
        ],
      }),
    );
    expect(markup).toContain('aria-label="Leyenda"');
    expect(markup).toContain("S&amp;P 500");
    expect(markup).toContain("SMA 20");
  });
});

describe("montaje en la ficha", () => {
  const panel = readFileSync(
    path.join(path.resolve(__dirname, "..", ".."), "app/(platform)/app/accion/[ticker]/price-panel.tsx"),
    "utf8",
  );

  it("Simple no pide series extra; Técnico pide el historial largo una vez", () => {
    expect(panel).toContain('from "@/content/i18n/extra-grafico"');
    expect(panel).toContain("graficoCopy(language)");
    expect(panel).toContain("useChartMode()");
    expect(panel).not.toContain("useHistory(SPY_SYMBOL, range)");
    expect(panel).not.toContain('useHistory(symbol, "ALL")');
    expect(panel).toContain('getHistory(SPY_SYMBOL, range)');
    expect(panel).toContain('getHistory(symbolKey, "ALL")');
    expect(panel).toContain("studyQueryOptions(spyEnabled)");
    expect(panel).toContain("studyQueryOptions(technical && symbolKey.length > 0)");
    expect(panel).toContain("refetchInterval: false");
    expect(panel).toContain("retry: false");
    expect(panel).toContain("STUDY_STALE_MS");
    expect(panel).toContain("if (!technical) return EMPTY_STUDIES");
    expect(panel).toContain("chartStudies(");
    expect(panel).toContain("barAvailability(points)");
    expect(panel).toContain("<ChartStudyBar");
    expect(panel).toContain("<StudiesSkeleton");
    expect(panel).toContain("<RsiPanel");
    expect(panel).toContain("overlays={overlays}");
    expect(panel).toContain("benchmark={benchmark}");
    expect(panel).toContain('chartStyle={technical && bars.ohlc ? draw : "line"}');
    expect(panel).toContain("showVolume={technical && bars.volume && volumeOn}");
    expect(panel.split("copy.disclaimer").length - 1).toBe(1);
    expect(panel).toContain('import { SvgPriceChart } from "@/components/domain/svg-price-chart"');
    expect(panel).toContain('import { TONE_STROKE } from "@/components/domain/svg-price-chart"');
  });
});

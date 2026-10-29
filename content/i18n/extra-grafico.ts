import type { Preferences } from "@/lib/types";

/** Textos del gráfico. Misma forma en es-CL y en. */
export interface GraficoCopy {
  disclaimer: string;
  tipLabel: string;
  tip: string;
  tools: string;
  legend: string;
  vsSpy: string;
  spyLegend: string;
  sma20: string;
  sma50: string;
  sma200: string;
  rsi: string;
  rsiEmpty: string;
  rsiAxis: string;
  modeLabel: string;
  modeSimple: string;
  modeTechnical: string;
  styleLabel: string;
  styleLine: string;
  styleCandles: string;
  volume: string;
  studiesLoading: string;
}

export const graficoExtra: { esCL: GraficoCopy; en: GraficoCopy } = {
  esCL: {
    disclaimer: "Solo informativo, no es una recomendación",
    tipLabel: "Sobre los indicadores",
    tip: "S&P 500 muestra SPYx en el mismo rango: las dos series parten en cero y se ven como porcentaje. Las SMA 20, 50 y 200 promedian esa cantidad de cierres diarios. El RSI (14) va de 0 a 100; las líneas marcan 30 y 70.",
    tools: "Indicadores del gráfico",
    legend: "Leyenda",
    vsSpy: "vs S&P 500",
    spyLegend: "S&P 500",
    sma20: "SMA 20",
    sma50: "SMA 50",
    sma200: "SMA 200",
    rsi: "RSI",
    rsiEmpty: "No hay suficientes cierres en este rango para el RSI (14).",
    rsiAxis: "RSI (14), de 0 a 100. Líneas en 30 y 70.",
    modeLabel: "Modo del gráfico",
    modeSimple: "Simple",
    modeTechnical: "Técnico",
    styleLabel: "Dibujo del gráfico",
    styleLine: "Línea",
    styleCandles: "Velas",
    volume: "Volumen",
    studiesLoading: "Cargando indicadores",
  },
  en: {
    disclaimer: "For information only, not a recommendation",
    tipLabel: "About these indicators",
    tip: "S&P 500 shows SPYx over the same range: both series start at zero and are drawn as percent. SMA 20, 50, and 200 average that many daily closes. RSI (14) runs from 0 to 100; the lines sit at 30 and 70.",
    tools: "Chart indicators",
    legend: "Legend",
    vsSpy: "vs S&P 500",
    spyLegend: "S&P 500",
    sma20: "SMA 20",
    sma50: "SMA 50",
    sma200: "SMA 200",
    rsi: "RSI",
    rsiEmpty: "There are not enough closes in this range for RSI (14).",
    rsiAxis: "RSI (14), from 0 to 100. Lines at 30 and 70.",
    modeLabel: "Chart mode",
    modeSimple: "Simple",
    modeTechnical: "Technical",
    styleLabel: "Chart drawing",
    styleLine: "Line",
    styleCandles: "Candles",
    volume: "Volume",
    studiesLoading: "Loading indicators",
  },
};

export function graficoCopy(language: Preferences["language"]): GraficoCopy {
  return language === "en" ? graficoExtra.en : graficoExtra.esCL;
}

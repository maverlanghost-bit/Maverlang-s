import type { Preferences } from "@/lib/types";

/** Textos del gráfico técnico. Misma forma en es-CL y en. */
export interface GraficoCopy {
  disclaimer: string;
  help: string;
  tools: string;
  legend: string;
  vsSpy: string;
  spyLegend: string;
  spyHelp: string;
  sma20: string;
  sma50: string;
  sma200: string;
  smaTitle: string;
  smaHelp: string;
  rsi: string;
  rsiHelp: string;
  rsiEmpty: string;
  rsiAxis: string;
}

export const graficoExtra: { esCL: GraficoCopy; en: GraficoCopy } = {
  esCL: {
    disclaimer: "Solo informativo, no es una recomendación",
    help: "¿Qué es esto?",
    tools: "Indicadores del gráfico",
    legend: "Leyenda",
    vsSpy: "vs S&P 500",
    spyLegend: "S&P 500",
    spyHelp:
      "Muestra SPYx, el ETF del S&P 500 del catálogo, en el mismo rango. Las dos series parten en cero y se dibujan como porcentaje desde ese inicio. Solo informativo, no es una recomendación.",
    sma20: "SMA 20",
    sma50: "SMA 50",
    sma200: "SMA 200",
    smaTitle: "SMA",
    smaHelp:
      "La media móvil simple es el promedio de los últimos 20, 50 o 200 cierres diarios. Se calcula con el historial largo y se dibuja solo dentro del rango elegido. Solo informativo, no es una recomendación.",
    rsi: "RSI",
    rsiHelp:
      "El RSI (14) resume el tamaño de las alzas y las bajas de los últimos 14 cierres diarios en una escala de 0 a 100. Las líneas marcan 30 y 70. Solo informativo, no es una recomendación.",
    rsiEmpty: "No hay suficientes cierres en este rango para el RSI (14).",
    rsiAxis: "RSI (14), de 0 a 100. Líneas en 30 y 70.",
  },
  en: {
    disclaimer: "For information only, not a recommendation",
    help: "What is this?",
    tools: "Chart indicators",
    legend: "Legend",
    vsSpy: "vs S&P 500",
    spyLegend: "S&P 500",
    spyHelp:
      "Shows SPYx, the S&P 500 ETF in the catalog, over the same range. Both series start at zero and are drawn as percent from that start. For information only, not a recommendation.",
    sma20: "SMA 20",
    sma50: "SMA 50",
    sma200: "SMA 200",
    smaTitle: "SMA",
    smaHelp:
      "A simple moving average is the average of the last 20, 50, or 200 daily closes. It uses the long history and is drawn only inside the selected range. For information only, not a recommendation.",
    rsi: "RSI",
    rsiHelp:
      "RSI (14) summarizes the size of rises and falls over the last 14 daily closes on a scale from 0 to 100. The lines sit at 30 and 70. For information only, not a recommendation.",
    rsiEmpty: "There are not enough closes in this range for RSI (14).",
    rsiAxis: "RSI (14), from 0 to 100. Lines at 30 and 70.",
  },
};

export function graficoCopy(language: Preferences["language"]): GraficoCopy {
  return language === "en" ? graficoExtra.en : graficoExtra.esCL;
}

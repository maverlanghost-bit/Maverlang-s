/**
 * Textos de rendimiento, brecha y guía del token.
 * No viven en es-CL.ts ni en.ts: esta parte los mantiene aparte.
 * Mismas claves en los dos idiomas.
 */

export interface CarteraExtra {
  summaryLabel: string;
  currentValue: string;
  currentTip: string;
  invested: string;
  investedTip: string;
  totalGain: string;
  totalGainTip: string;
  totalPct: string;
  totalPctTip: string;
  best: string;
  bestTip: string;
  worst: string;
  worstTip: string;
  emptyFigure: string;
  period: string;
  periodTip: string;
  disclaimer: string;
  avgCost: string;
  avgCostTip: string;
  whatIsThis: string;
  gapTitle: string;
  gapToken: string;
  gapClose: string;
  gapAbove: string;
  gapBelow: string;
  gapEven: string;
  gapWhy: string;
  gapTip: string;
  tokenGuideTitle: string;
  tokenGuideBody: string;
}

const disclaimer = "Solo informativo, no es una recomendación.";
const disclaimerEn = "For information only, not a recommendation.";

const esCL: CarteraExtra = {
  summaryLabel: "Resumen de la cartera",
  currentValue: "Valor actual",
  currentTip: `Suma del USDC disponible y del valor de tus posiciones al precio actual de cada token. ${disclaimer}`,
  invested: "Invertido",
  investedTip: `Suma del costo promedio de cada posición. El USDC disponible no entra. Si falta el costo de alguna, esta cifra no se muestra. ${disclaimer}`,
  totalGain: "Ganancia total",
  totalGainTip: `Diferencia entre el valor de las posiciones y su costo promedio. Si el número es negativo, es una pérdida. ${disclaimer}`,
  totalPct: "% total",
  totalPctTip: `Esa diferencia dividida por lo invertido al costo promedio. ${disclaimer}`,
  best: "Mejor posición",
  bestTip: `La posición con el mayor resultado en porcentaje desde el costo promedio. ${disclaimer}`,
  worst: "Peor posición",
  worstTip: `La posición con el menor resultado en porcentaje desde el costo promedio. ${disclaimer}`,
  emptyFigure: "Sin dato",
  period: "En el período",
  periodTip: `Cambio del valor de la cartera entre el primer y el último punto del gráfico de este período. ${disclaimer}`,
  disclaimer,
  avgCost: "Costo promedio",
  avgCostTip: `Precio medio de esta posición. El resultado de la fila compara el precio actual del token con este costo. ${disclaimer}`,
  whatIsThis: "¿Qué es esto?",
  gapTitle: "Token y acción en EE.UU.",
  gapToken: "Precio del token",
  gapClose: "Último cierre en EE.UU.",
  gapAbove: "El token está {pct} sobre la acción en EE.UU.",
  gapBelow: "El token está {pct} bajo la acción en EE.UU.",
  gapEven: "El token está al mismo precio que el último cierre de la acción en EE.UU.",
  gapWhy: `Puede haber diferencia por el horario de la bolsa de EE.UU., la liquidez del pool y las comisiones del pool. ${disclaimer}`,
  gapTip: `Compara el precio actual del token en la app con el último cierre de un mes de la acción en EE.UU. ${disclaimer}`,
  tokenGuideTitle: "¿Qué es un token de acción?",
  tokenGuideBody: `Un token de acción, como un xStock de Backed o un token de Ondo, es un registro en Solana asociado a una acción de Estados Unidos: no es la acción misma y no entrega esa acción ni derechos en la empresa. El precio puede diferir por el horario de la bolsa, la liquidez del pool y las comisiones del pool, y el valor puede bajar. ${disclaimer}`,
};

const en: CarteraExtra = {
  summaryLabel: "Portfolio summary",
  currentValue: "Current value",
  currentTip: `USDC on hand plus your positions at each token's current price. ${disclaimerEn}`,
  invested: "Invested",
  investedTip: `Sum of each position at its average cost. Available USDC is not included. If any position has no cost, this figure is hidden. ${disclaimerEn}`,
  totalGain: "Total gain",
  totalGainTip: `Difference between the value of the positions and their average cost. A negative number is a loss. ${disclaimerEn}`,
  totalPct: "Total %",
  totalPctTip: `That difference divided by the amount invested at average cost. ${disclaimerEn}`,
  best: "Best position",
  bestTip: `The position with the highest percent result from average cost. ${disclaimerEn}`,
  worst: "Worst position",
  worstTip: `The position with the lowest percent result from average cost. ${disclaimerEn}`,
  emptyFigure: "No data",
  period: "Over the period",
  periodTip: `Change in portfolio value from the first point to the last point of this chart. ${disclaimerEn}`,
  disclaimer: disclaimerEn,
  avgCost: "Average cost",
  avgCostTip: `Average price of this position. The row result compares the token's current price with this cost. ${disclaimerEn}`,
  whatIsThis: "What is this?",
  gapTitle: "Token and U.S. stock",
  gapToken: "Token price",
  gapClose: "Latest U.S. close",
  gapAbove: "The token is {pct} above the U.S. stock.",
  gapBelow: "The token is {pct} below the U.S. stock.",
  gapEven: "The token matches the latest close of the U.S. stock.",
  gapWhy: `The prices can differ because of U.S. market hours, pool liquidity, and pool fees. ${disclaimerEn}`,
  gapTip: `Compares the token price in the app with the latest one-month close of the U.S. stock. ${disclaimerEn}`,
  tokenGuideTitle: "What is a stock token?",
  tokenGuideBody: `A stock token, such as a Backed xStock or an Ondo token, is a Solana record tied to a U.S. stock: it is not the stock itself and it does not deliver that stock or rights in the company. The price can differ because of market hours, pool liquidity, and pool fees, and the value can fall. ${disclaimerEn}`,
};

export const extraCartera = { esCL, en };

export function carteraCopy(language: "es-CL" | "en"): CarteraExtra {
  return language === "en" ? extraCartera.en : extraCartera.esCL;
}

/**
 * Textos cortos del pulido de cartera. No van en extra-cartera.ts:
 * esa parte la mantiene otro archivo. Mismas claves en es-CL y en.
 */

export interface CarteraUi {
  summaryTip: string;
  positionsTip: string;
  onChart: string;
}

const disclaimer = "Solo informativo, no es una recomendación.";
const disclaimerEn = "For information only, not a recommendation.";

const esCL: CarteraUi = {
  summaryTip: `El valor actual suma el USDC y tus posiciones al precio de cada token. La ganancia y lo invertido miran el costo promedio, sin el USDC. Si falta un costo, esa cifra no se muestra. ${disclaimer}`,
  positionsTip: `La ganancia de cada fila compara el precio del token con su costo promedio. ${disclaimer}`,
  onChart: "Punto del gráfico",
};

const en: CarteraUi = {
  summaryTip: `Current value adds USDC and your positions at each token price. Gain and amount invested use average cost, and leave out USDC. If a cost is missing, that figure stays hidden. ${disclaimerEn}`,
  positionsTip: `The gain on each row compares the token price with its average cost. ${disclaimerEn}`,
  onChart: "Chart point",
};

export const extraCartera2 = { esCL, en };

export function carteraUi(language: "es-CL" | "en"): CarteraUi {
  return language === "en" ? extraCartera2.en : extraCartera2.esCL;
}

import { describe, expect, it } from "vitest";

import { carteraCopy, extraCartera, type CarteraExtra } from "@/content/i18n/extra-cartera";

const ADVICE = /compra|vende|\bbuy\b|\bsell\b|guaranteed|risk-free|risk free/;

describe("textos de cartera y brecha", () => {
  it("es-CL y en tienen las mismas claves", () => {
    const esKeys = Object.keys(extraCartera.esCL).sort();
    const enKeys = Object.keys(extraCartera.en).sort();
    expect(enKeys).toEqual(esKeys);
    for (const key of esKeys) {
      const typed = key as keyof CarteraExtra;
      expect(extraCartera.esCL[typed].length).toBeGreaterThan(0);
      expect(extraCartera.en[typed].length).toBeGreaterThan(0);
    }
  });

  it("sigue el idioma y deja el aviso neutro en las cifras", () => {
    expect(carteraCopy("es-CL")).toBe(extraCartera.esCL);
    expect(carteraCopy("en")).toBe(extraCartera.en);
    expect(extraCartera.esCL.disclaimer).toBe("Solo informativo, no es una recomendación.");
    expect(extraCartera.en.disclaimer).toBe("For information only, not a recommendation.");
    expect(extraCartera.esCL.gapWhy).toContain(extraCartera.esCL.disclaimer);
    expect(extraCartera.esCL.alertCreate).toBe("Crear alerta de precio");
    expect(extraCartera.esCL.alertSignIn).toBe("Ingresa para crear alertas");
    expect(extraCartera.esCL.tokenGuideBody).toContain("xStock");
    expect(extraCartera.esCL.tokenGuideBody).toContain("Ondo");
    expect(extraCartera.en.tokenGuideBody).toContain("not the stock itself");
  });

  it("no pide operar ni promete un resultado", () => {
    const blob = `${JSON.stringify(extraCartera.esCL)}\n${JSON.stringify(extraCartera.en)}`;
    expect(blob).not.toMatch(ADVICE);
  });
});

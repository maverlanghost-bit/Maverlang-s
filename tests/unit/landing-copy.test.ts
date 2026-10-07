import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

describe("M45: copy de la portada alineado con el producto", () => {
  const files = [
    "components/landing/hero.tsx",
    "components/landing/feature-grid.tsx",
    "components/landing/final-cta.tsx",
  ];

  for (const file of files) {
    it(`${file}: sin mínimo viejo ni pago en pesos`, () => {
      const source = read(file);
      expect(source).not.toContain("desde $1.000");
      expect(source).not.toContain("pagas en pesos");
      expect(source).not.toContain("pagando con pesos");
    });
  }

  it("hero: la frase de custodia y el 24/7 siguen idénticos", () => {
    const source = read("components/landing/hero.tsx");
    expect(source).toContain("nosotros no custodiamos tus activos");
    expect(source).toContain("24/7");
  });

  it("hero y CTA final: llevan al registro de la demo", () => {
    expect(read("components/landing/hero.tsx")).toContain("Prueba la demo gratis");
    expect(read("components/landing/hero.tsx")).toContain('href="/app/registro"');
    expect(read("components/landing/final-cta.tsx")).toContain("Prueba la demo gratis");
    expect(read("components/landing/final-cta.tsx")).toContain('href="/app/registro"');
  });

  it("el mínimo del copy sale de la constante del código", () => {
    expect(read("components/landing/hero.tsx")).toContain("LANDING_MIN_ORDER_USD");
    expect(read("components/landing/feature-grid.tsx")).toContain("LANDING_MIN_ORDER_USD");
  });
});

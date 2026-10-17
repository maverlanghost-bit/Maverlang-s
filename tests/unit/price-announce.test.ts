import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");

/**
 * M85: el anuncio de precios en vivo a lectores de pantalla lleva throttle.
 * Los ticks llegan cada 5 s (`SPOT_MS`) y cada 15 s (`PRICE_MS`); anunciar
 * cada tick satura al usuario. `PriceText` con `live` mantiene el precio
 * visible como texto accesible y anuncia en una región `aria-live="polite"`
 * visualmente oculta, a lo sumo una vez cada `PRICE_ANNOUNCE_MS`.
 */
describe("M85: anuncio de precio en vivo con throttle", () => {
  const source = readFileSync(path.join(ROOT, "components", "domain", "price-text.tsx"), "utf8");

  it("PRICE_ANNOUNCE_MS es 10 s (más lento que el tick más frecuente de 5 s)", () => {
    expect(source).toContain("export const PRICE_ANNOUNCE_MS = 10_000");
  });

  it("la región viva es polite y queda oculta visualmente", () => {
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('className="sr-only"');
  });

  it("el anuncio parte vacío: la carga de la página no se anuncia", () => {
    expect(source).toContain('useState("")');
  });

  it("el precio visible sigue accesible (sin aria-hidden alrededor del texto)", () => {
    expect(source).not.toContain("aria-hidden>{text}");
    expect(source).toContain("<span>{text}</span>");
  });
});

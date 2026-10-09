import { describe, expect, it } from "vitest";

import { logoPathFromSymbol, logoPathIfPresent } from "@/lib/catalog/logos";

describe("logo local", () => {
  it("usa el archivo del subyacente y no inventa uno", () => {
    const files = new Set(["aal.png", "brk-b.png"]);
    expect(logoPathIfPresent("AAL", files)).toBe("/logos/aal.png");
    expect(logoPathIfPresent("BRK.B", files)).toBe("/logos/brk-b.png");
    expect(logoPathIfPresent("ZZZ", files)).toBeNull();
    expect(logoPathIfPresent("", files)).toBeNull();
    expect(logoPathIfPresent("   ", new Set(["token.png"]))).toBeNull();
  });

  it("arma la ruta desde el símbolo de Ondo y de xStocks", () => {
    expect(logoPathFromSymbol("AALon")).toBe("/logos/aal.png");
    expect(logoPathFromSymbol("ABNBon")).toBe("/logos/abnb.png");
    expect(logoPathFromSymbol("ONon")).toBe("/logos/on.png");
    expect(logoPathFromSymbol("BRK.Bx")).toBe("/logos/brk-b.png");
    expect(logoPathFromSymbol("AAPLx")).toBe("/logos/aapl.png");
    expect(logoPathFromSymbol("USDC")).toBeNull();
    expect(logoPathFromSymbol("")).toBeNull();
  });
});

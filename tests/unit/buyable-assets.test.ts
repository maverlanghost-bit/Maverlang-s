import { describe, expect, it } from "vitest";

import { buyableAssetRows } from "@/lib/catalog/safety-core.mjs";

const row = (over: Record<string, unknown>) => ({
  symbol: "X",
  enabled: true,
  is_trading_halted: false,
  curated: false,
  issuer: "xstocks",
  safety_status: null,
  ...over,
});

describe("buyableAssetRows (carga diaria = regla de la app)", () => {
  it("en transición: curadas operables y Ondo en watch; el resto no", () => {
    const rows = [
      row({ symbol: "AAPLx", curated: true }),
      row({ symbol: "HALTx", curated: true, is_trading_halted: true }),
      row({ symbol: "ADSx" }),
      row({ symbol: "AAPLon", issuer: "ondo", safety_status: "watch" }),
      row({ symbol: "HIDon", issuer: "ondo", safety_status: "hidden" }),
    ];
    expect(buyableAssetRows(rows).map((r) => r.symbol)).toEqual(["AAPLx", "AAPLon"]);
  });

  it("con alguna listed termina la transición: solo listed (y Ondo en watch)", () => {
    const rows = [
      row({ symbol: "AAPLx", curated: true }),
      row({ symbol: "MSFTx", safety_status: "listed" }),
      row({ symbol: "AAPLon", issuer: "ondo", safety_status: "watch" }),
      row({ symbol: "OFFx", safety_status: "listed", enabled: false }),
    ];
    expect(buyableAssetRows(rows).map((r) => r.symbol)).toEqual(["MSFTx", "AAPLon"]);
  });
});

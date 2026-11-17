import { describe, expect, it } from "vitest";
import { displayFavoriteSymbols, toggleFavoriteSymbol } from "@/lib/favorites/display";
import { mergeFavoriteSymbols } from "@/lib/favorites/merge";

describe("identidad de favoritas", () => {
  it("recupera símbolos oficiales tras la mezcla en mayúsculas y elimina duplicados", () => {
    const merged = mergeFavoriteSymbols(["AAPLx", "NVDAx"], ["aaplx"]);
    expect(merged).toEqual(["AAPLX", "NVDAX"]);
    expect(displayFavoriteSymbols(merged)).toEqual(["AAPLx", "NVDAx"]);
    expect(displayFavoriteSymbols(["AAPLX", "aaplx", "DESCONOCIDO"])).toEqual(["AAPLx", "DESCONOCIDO"]);
  });
  it("alterna sin duplicar ni depender de mayúsculas", () => {
    expect(toggleFavoriteSymbol(["AAPLX"], "AAPLx")).toEqual([]);
    expect(toggleFavoriteSymbol([], "aaplx")).toEqual(["AAPLx"]);
    expect(toggleFavoriteSymbol(["DESCONOCIDO"], "desconocido")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { canonicalSlug, isAlias } from "@/lib/copy/slugs";

/**
 * Slugs de «Copiar carteras» (§1.7): sólo canónicos; alias → 308; demos
 * ocultos de familias excluidas → 404 (`null`). Sin red y sin base.
 */

describe("copy/slugs: alias → canónico", () => {
  it("resuelve los alias de 13F y los normaliza", () => {
    expect(canonicalSlug("berkshire-hathaway")).toBe("berkshire-hathaway-13f");
    expect(canonicalSlug("scion-asset-management")).toBe("scion-13f");
    expect(canonicalSlug("pershing-square")).toBe("pershing-square-13f");
    expect(canonicalSlug("renaissance-institutional")).toBe("renaissance-13f");
    expect(canonicalSlug("bridgewater-all-weather")).toBe("bridgewater-13f");
    expect(canonicalSlug("  Berkshire-Hathaway  ")).toBe("berkshire-hathaway-13f");
  });

  it("deja pasar el slug canónico tal cual", () => {
    expect(canonicalSlug("berkshire-hathaway-13f")).toBe("berkshire-hathaway-13f");
    expect(canonicalSlug("arkk")).toBe("arkk");
    expect(canonicalSlug("bice-acciones-destacadas")).toBe("bice-acciones-destacadas");
  });

  it("no inventa canónicos: un slug válido y desconocido pasa y el feed decide", () => {
    expect(canonicalSlug("cartera-inventada-13f")).toBe("cartera-inventada-13f");
  });
});

describe("copy/slugs: familias excluidas → null", () => {
  it("los demos ocultos de políticos y Cramer no resuelven", () => {
    expect(canonicalSlug("elon-doge-tracker")).toBeNull();
    expect(canonicalSlug("trump-truth-signals")).toBeNull();
    expect(canonicalSlug("inverse-cramer")).toBeNull();
  });

  it("sus destinos tampoco existen en el feed", () => {
    expect(canonicalSlug("musk-dice")).toBeNull();
    expect(canonicalSlug("trump-dice")).toBeNull();
    expect(canonicalSlug("inverse-cramer-real")).toBeNull();
  });

  it("un slug malformado o vacío devuelve null", () => {
    expect(canonicalSlug("")).toBeNull();
    expect(canonicalSlug("   ")).toBeNull();
    expect(canonicalSlug(null)).toBeNull();
    expect(canonicalSlug(undefined)).toBeNull();
    expect(canonicalSlug("../etc/passwd")).toBeNull();
    expect(canonicalSlug("con espacios")).toBeNull();
  });
});

describe("copy/slugs: isAlias", () => {
  it("distingue alias de canónico", () => {
    expect(isAlias("berkshire-hathaway")).toBe(true);
    expect(isAlias("scion-asset-management")).toBe(true);
    expect(isAlias("berkshire-hathaway-13f")).toBe(false);
    expect(isAlias("arkk")).toBe(false);
  });

  it("los demos ocultos no cuentan como alias", () => {
    expect(isAlias("elon-doge-tracker")).toBe(false);
    expect(isAlias("inverse-cramer")).toBe(false);
    expect(isAlias("")).toBe(false);
    expect(isAlias(null)).toBe(false);
  });
});

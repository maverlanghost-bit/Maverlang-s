import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useMounted } from "@/lib/hooks/use-mounted";
import {
  FRESHNESS_PLACEHOLDER_TEXT,
  formatFreshness,
  resolveFreshnessText,
} from "@/lib/market/freshness";

describe("M42b: frescura estable antes de montar (hidratación de la portada)", () => {
  it("sin montar devuelve el marcador estable, sin importar el tiempo ni el idioma", () => {
    expect(resolveFreshnessText(false, 0, "es-CL")).toBe(FRESHNESS_PLACEHOLDER_TEXT);
    expect(resolveFreshnessText(false, 29, "es-CL")).toBe(FRESHNESS_PLACEHOLDER_TEXT);
    expect(resolveFreshnessText(false, 90, "en")).toBe(FRESHNESS_PLACEHOLDER_TEXT);
    expect(FRESHNESS_PLACEHOLDER_TEXT).not.toContain("Actualizado");
    expect(FRESHNESS_PLACEHOLDER_TEXT).not.toContain("Updated");
  });

  it("montado devuelve el relativo de siempre, con locale fijo", () => {
    expect(resolveFreshnessText(true, 5, "es-CL")).toBe(formatFreshness(5, "es-CL"));
    expect(resolveFreshnessText(true, 5, "es-CL")).toBe("Actualizado hace 5 s");
    expect(resolveFreshnessText(true, 90, "es-CL")).toBe("Actualizado hace 1 min");
    expect(resolveFreshnessText(true, 7, "en")).toBe("Updated 7s ago");
  });

  it("useMounted es false en el servidor: el primer render es estable", () => {
    function Probe() {
      return createElement("span", null, useMounted() ? "montado" : "pendiente");
    }
    expect(renderToString(createElement(Probe))).toContain("pendiente");
  });
});

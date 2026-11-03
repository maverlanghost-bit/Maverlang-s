import { describe, expect, it } from "vitest";

import { applyStaticHeaders, buildApiHeaders, buildStaticHeaders } from "@/lib/security/headers";

/**
 * B-01 de la auditoría: CORP, X-DNS-Prefetch-Control y
 * X-Permitted-Cross-Domain-Policies. El resto de las cabeceras (COOP, HSTS,
 * XFO, nosniff) se cubre en `csp.test.ts`, que ya las verificaba desde M48.
 */
describe("B-01: cabeceras de endurecimiento", () => {
  it("CORP same-origin, DNS prefetch off y políticas de dominios cruzados none", () => {
    const headers = Object.fromEntries(
      buildStaticHeaders({ isProd: true }).map(({ key, value }) => [key, value]),
    );
    expect(headers["Cross-Origin-Resource-Policy"]).toBe("same-origin");
    expect(headers["X-DNS-Prefetch-Control"]).toBe("off");
    expect(headers["X-Permitted-Cross-Domain-Policies"]).toBe("none");
  });

  it("COOP se mantiene en same-origin-allow-popups (Privy y Google abren popups)", () => {
    const headers = Object.fromEntries(
      buildStaticHeaders({ isProd: false }).map(({ key, value }) => [key, value]),
    );
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
  });

  it("applyStaticHeaders escribe las cabeceras en la respuesta", () => {
    const target = new Headers();
    applyStaticHeaders(target, { isProd: false });
    expect(target.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(target.get("x-dns-prefetch-control")).toBe("off");
    expect(target.get("x-permitted-cross-domain-policies")).toBe("none");
    expect(target.get("x-content-type-options")).toBe("nosniff");
    expect(target.get("strict-transport-security")).toBeNull();

    const prod = new Headers();
    applyStaticHeaders(prod, { isProd: true });
    expect(prod.get("strict-transport-security")).toContain("max-age=63072000");
  });

  it("cada llamada devuelve copias: mutar el resultado no contamina la siguiente", () => {
    const first = buildStaticHeaders({ isProd: false });
    const firstNosniff = first.find((header) => header.key === "X-Content-Type-Options");
    expect(firstNosniff).toBeDefined();
    if (firstNosniff) firstNosniff.value = "manipulado";
    expect(buildStaticHeaders({ isProd: false })[0]?.value).toBe("nosniff");

    const api = buildApiHeaders();
    const apiNosniff = api.find((header) => header.key === "X-Content-Type-Options");
    expect(apiNosniff).toBeDefined();
    if (apiNosniff) apiNosniff.value = "manipulado";
    expect(buildApiHeaders()[0]?.value).toBe("nosniff");
  });

  it("la API lleva nosniff + CORP + DNS + dominios cruzados, sin HSTS ni XFO", () => {
    const api = buildApiHeaders();
    const values = Object.fromEntries(api.map(({ key, value }) => [key, value]));
    expect(values).toEqual({
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-DNS-Prefetch-Control": "off",
      "X-Permitted-Cross-Domain-Policies": "none",
    });
  });
});

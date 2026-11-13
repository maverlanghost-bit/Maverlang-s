import { afterEach, describe, expect, it, vi } from "vitest";

import { lstBySymbol } from "@/lib/catalog/lst";

interface ApyEntry {
  apyFraction: number | null;
  apyPercent: number | null;
  asOf: string | null;
  source: string;
}

type ApyMap = Record<string, ApyEntry>;

/** Lo que muestra la UI cuando la fuente no da dato: nunca 0 inventado. */
const SIN_DATO: ApyEntry = { apyFraction: null, apyPercent: null, asOf: null, source: "none" };

/**
 * `fetchLstApys` puede venir por símbolo o por mint: se acepta cualquiera de
 * las dos claves. Una entrada ausente también significa "sin dato".
 */
function apyOf(map: ApyMap, symbol: string): ApyEntry {
  const direct = map[symbol];
  if (direct) return direct;
  const mint = lstBySymbol.get(symbol)?.mint;
  if (mint) {
    const byMint = map[mint];
    if (byMint) return byMint;
  }
  return SIN_DATO;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Jito Kobe: `apy[].data` en fracción; el punto más reciente es el último. */
const JITO_BODY = {
  apy: [
    { timestamp: 1_700_000_000, data: 0.041 },
    { timestamp: 1_700_003_600, data: 0.048 },
  ],
};

const MARINADE_BODY = { value: 0.05467 };
const BLAZE_BODY = { apy: 4.9 };

function stubSources(
  overrides: {
    jito?: Response | (() => Response) | "network-error";
    marinade?: Response | (() => Response) | "network-error";
    blaze?: Response | (() => Response) | "network-error";
  } = {},
): void {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    const pick = (key: "jito" | "marinade" | "blaze"): Response => {
      const value = overrides[key];
      if (value === "network-error") throw new Error("red caída");
      if (typeof value === "function") return value();
      if (value) return value;
      if (key === "jito") return jsonResponse(JITO_BODY);
      if (key === "marinade") return jsonResponse(MARINADE_BODY);
      return jsonResponse(BLAZE_BODY);
    };
    if (url.includes("jito.network")) return pick("jito");
    if (url.includes("marinade.finance")) return pick("marinade");
    if (url.includes("solblaze.org")) return pick("blaze");
    return new Response("no", { status: 404 });
  });
}

/**
 * Módulo fresco por test: `lst-apy.ts` cachea en memoria hasta 10 min y cada
 * test necesita su propio mock de `fetch`.
 */
async function fetchApys(): Promise<ApyMap> {
  vi.resetModules();
  const apyModule = await import("@/lib/market/lst-apy");
  return apyModule.fetchLstApys();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("APY de Ganar (§1.8)", () => {
  it("normaliza Jito y Marinade desde fracción y Blaze desde porcentaje", async () => {
    stubSources();
    const map = await fetchApys();

    const jito = apyOf(map, "JitoSOL");
    expect(jito.apyFraction).toBeCloseTo(0.048, 6);
    expect(jito.apyPercent).toBeCloseTo(4.8, 6);
    expect(jito.source).toBe("jito");

    const marinade = apyOf(map, "mSOL");
    expect(marinade.apyFraction).toBeCloseTo(0.05467, 6);
    expect(marinade.apyPercent).toBeCloseTo(5.467, 6);
    expect(marinade.source).toBe("marinade7d");

    // bSOL llega como 4.9 (porcentaje): 0,049 en fracción y 4,9 % en pantalla.
    const blaze = apyOf(map, "bSOL");
    expect(blaze.apyFraction).toBeCloseTo(0.049, 6);
    expect(blaze.apyPercent).toBeCloseTo(4.9, 6);
    expect(blaze.source).toBe("blaze");
  });

  it("un APY 0 se muestra como sin dato, nunca como 0 %", async () => {
    stubSources({
      jito: jsonResponse({ apy: [{ data: 0 }] }),
      marinade: jsonResponse({ value: 0 }),
      blaze: jsonResponse({ apy: 0 }),
    });
    const map = await fetchApys();

    for (const symbol of ["JitoSOL", "mSOL", "bSOL"]) {
      const entry = apyOf(map, symbol);
      expect(entry.apyFraction, symbol).toBeNull();
      expect(entry.apyPercent, symbol).toBeNull();
    }
  });

  it("un APY negativo o no numérico también queda sin dato", async () => {
    stubSources({
      jito: jsonResponse({ apy: [{ data: -0.01 }] }),
      marinade: jsonResponse({ value: "sin-dato" }),
      blaze: jsonResponse({ apy: null }),
    });
    const map = await fetchApys();

    for (const symbol of ["JitoSOL", "mSOL", "bSOL"]) {
      expect(apyOf(map, symbol).apyPercent, symbol).toBeNull();
    }
  });

  it("si la red falla, todas las fuentes quedan sin dato y no lanza", async () => {
    stubSources({ jito: "network-error", marinade: "network-error", blaze: "network-error" });
    const map = await fetchApys();

    for (const symbol of ["JitoSOL", "mSOL", "bSOL"]) {
      const entry = apyOf(map, symbol);
      expect(entry.apyFraction, symbol).toBeNull();
      expect(entry.apyPercent, symbol).toBeNull();
    }
  });

  it("un JSON roto no rompe la respuesta: queda sin dato", async () => {
    const roto = () => new Response("no es json", { status: 200 });
    stubSources({ jito: roto, marinade: roto, blaze: roto });
    const map = await fetchApys();

    for (const symbol of ["JitoSOL", "mSOL", "bSOL"]) {
      expect(apyOf(map, symbol).apyFraction, symbol).toBeNull();
    }
  });

  it("una fuente caída no bota a las otras", async () => {
    stubSources({ jito: new Response("boom", { status: 500 }) });
    const map = await fetchApys();

    expect(apyOf(map, "JitoSOL").apyFraction).toBeNull();
    expect(apyOf(map, "mSOL").apyFraction).toBeCloseTo(0.05467, 6);
    expect(apyOf(map, "bSOL").apyFraction).toBeCloseTo(0.049, 6);
  });
});

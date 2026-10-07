import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { fetchJsonWithRetry } from "../../scripts/audit-catalog.mjs";
import {
  classifyProduct,
  effectiveMultiplier,
  evaluateAsset,
  quoteCostBps,
  SAFETY_THRESHOLDS,
  staticChecks,
} from "../../lib/catalog/safety-core.mjs";

const ROOT = path.resolve(__dirname, "..", "..");

const AAPL_MINT = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";

function canonToken(symbol = "AAPLx") {
  return {
    id: AAPL_MINT,
    symbol,
    isVerified: true,
    tags: ["xstocks"],
    mintAuthority: SAFETY_THRESHOLDS.mintAuthority,
    freezeAuthority: SAFETY_THRESHOLDS.freezeAuthority,
    tokenProgram: SAFETY_THRESHOLDS.tokenProgram,
    decimals: 8,
  };
}

function aaplNode(overrides = {}) {
  return {
    symbol: "AAPLx",
    name: "Apple xStock",
    mint: AAPL_MINT,
    exchangeMic: "XNAS",
    underlyingCurrency: "USD",
    isTradingHalted: false,
    trading: { tradingHoursMode: "TwentyFourFive", currentPeriod: "regular", isTradingHalted: false },
    refPrice: 332.85,
    ...overrides,
  };
}

describe("M52: costo real de AAPLx", () => {
  it("compra de 100 USDC cuesta ~26 bps", () => {
    const cost = quoteCostBps({
      side: "buy",
      inAmount: 100_000_000,
      outAmount: 29867868,
      multiplier: 1.0032690125,
      refPrice: 332.85,
    });
    expect(cost).toBeCloseTo(26, 0);
  });

  it("el multiplicador vigente respeta newMultiplierEffectiveAt", () => {
    const scaled = {
      multiplier: 1,
      newMultiplier: 1.0032690125,
      newMultiplierEffectiveAt: "2026-01-01T00:00:00.000Z",
    };
    expect(effectiveMultiplier(scaled, "2026-10-06T00:00:00.000Z")).toBe(1.0032690125);
    expect(effectiveMultiplier(scaled, "2025-01-01T00:00:00.000Z")).toBe(1);
  });
});

describe("M52: classifyProduct", () => {
  it("apalancado, ETF por excepción, ETF por MIC y acción", () => {
    expect(classifyProduct("Direxion Daily TSLA Bull 2X", "XNAS")).toBe("leveraged");
    expect(classifyProduct("JPMorgan Ultra-Short Income xStock", "XNAS")).toBe("etf");
    expect(classifyProduct("SP500 xStock", "ARCX")).toBe("etf");
    expect(classifyProduct("Apple xStock", "XNAS")).toBe("stock");
  });
});

describe("M52: staticChecks", () => {
  it("AAPLx canónico no tiene motivos", () => {
    expect(staticChecks({ node: aaplNode(), jupToken: canonToken(), snapshotMint: AAPL_MINT })).toEqual([]);
  });

  it("freezeAuthority distinta da autoridades_no_canonicas", () => {
    const reasons = staticChecks({
      node: aaplNode(),
      jupToken: { ...canonToken(), freezeAuthority: "otra" },
      snapshotMint: AAPL_MINT,
    });
    expect(reasons).toContain("autoridades_no_canonicas");
  });

  it("mint distinto al snapshot da mint_distinto_al_snapshot_oficial", () => {
    const reasons = staticChecks({
      node: aaplNode(),
      jupToken: canonToken(),
      snapshotMint: "Xs000000000000000000000000000000000000000001",
    });
    expect(reasons).toContain("mint_distinto_al_snapshot_oficial");
  });

  it("exchange null da bolsa_no_informada", () => {
    const reasons = staticChecks({
      node: aaplNode({ exchangeMic: null }),
      jupToken: canonToken(),
      snapshotMint: AAPL_MINT,
    });
    expect(reasons).toContain("bolsa_no_informada");
  });

  it("XLON da bolsa_no_permitida_XLON", () => {
    const reasons = staticChecks({
      node: aaplNode({ exchangeMic: "XLON" }),
      jupToken: canonToken(),
      snapshotMint: AAPL_MINT,
    });
    expect(reasons).toContain("bolsa_no_permitida_XLON");
  });

  it("TSLLx da apalancado y bolsa no informada", () => {
    const reasons = staticChecks({
      node: aaplNode({
        symbol: "TSLLx",
        name: "Direxion Daily TSLA Bull 2X Shares xStock",
        mint: "XsWfu1svxj6DPqQZFAinCvtDa1EvgAZGx5qocUkrrA6",
        exchangeMic: null,
      }),
      jupToken: null,
      snapshotMint: null,
    });
    expect(reasons).toContain("producto_apalancado_inverso_o_volatilidad");
    expect(reasons).toContain("bolsa_no_informada");
  });
});

describe("M52: evaluateAsset", () => {
  it("pasa con 26/40/35 bps", () => {
    const verdict = evaluateAsset({
      staticReasons: [],
      buy100: { ok: true, costBps: 26 },
      buy1000: { ok: true, costBps: 40 },
      sell100: { ok: true, costBps: 35 },
      jupUsdPrice: 333.33,
      refPrice: 332.85,
      liquidityUsd: 584194,
    });
    expect(verdict.result).toBe("pass");
    expect(verdict.reasons).toEqual([]);
    expect(verdict.tier).toBe("A");
  });

  it("falla con la venta sin ruta", () => {
    const verdict = evaluateAsset({
      staticReasons: [],
      buy100: { ok: true, costBps: 26 },
      buy1000: { ok: true, costBps: 40 },
      sell100: { ok: false, error: "sin ruta" },
      jupUsdPrice: 333.33,
      refPrice: 332.85,
      liquidityUsd: 584194,
    });
    expect(verdict.result).toBe("fail");
    expect(verdict.reasons).toContain("sin_ruta_venta_100");
  });

  it("falla con desviación de 450 bps", () => {
    const verdict = evaluateAsset({
      staticReasons: [],
      buy100: { ok: true, costBps: 20 },
      buy1000: { ok: true, costBps: 40 },
      sell100: { ok: true, costBps: 35 },
      jupUsdPrice: 348,
      refPrice: 332.85,
      liquidityUsd: 584194,
    });
    expect(verdict.result).toBe("fail");
    expect(verdict.reasons.some((reason) => reason.startsWith("desviacion_precio_"))).toBe(true);
  });
});

describe("M52: las 50 curadas siguen en el generado", () => {
  it("ningún símbolo ni mint se pierde", () => {
    const curated = JSON.parse(readFileSync(path.join(ROOT, "data", "curated-symbols.json"), "utf8"));
    const symbols = curated.symbols.map((entry: { symbol: string }) => entry.symbol);
    expect(symbols).toHaveLength(50);
    const generated = readFileSync(path.join(ROOT, "config", "tickers.generated.ts"), "utf8");
    for (const symbol of symbols) {
      expect(generated.includes(`symbol: "${symbol}"`), symbol).toBe(true);
    }
    const mints = [...generated.matchAll(/mint:\s*"([^"]+)"/g)].map((match) => match[1]);
    expect(mints).toHaveLength(50);
    for (const mint of mints) {
      expect(mint.startsWith("Xs"), mint).toBe(true);
    }
  });
});

describe("M52: safety-core sin red ni entorno", () => {
  it("no importa nada de Node ni de red", () => {
    const source = readFileSync(path.join(ROOT, "lib", "catalog", "safety-core.mjs"), "utf8");
    expect(source.includes("fetch(")).toBe(false);
    expect(source.includes("process.")).toBe(false);
    expect(source.includes('import "server-only"')).toBe(false);
    expect(source.includes("import 'server-only'")).toBe(false);
  });
});

describe("M52: un 429 no tumba el script", () => {
  it("reintenta 429 y luego devuelve el 200", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("límite", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const res = await fetchJsonWithRetry("https://example.invalid/x", {
      fetchImpl,
      tries: 3,
      timeoutMs: 5000,
      baseWaitMs: 1,
      maxWaitMs: 5,
    });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

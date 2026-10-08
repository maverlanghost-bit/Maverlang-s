import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ONDO_TICKERS } from "@/config/ondo.generated";
import {
  __clearAssetsCacheForTests,
  __setAssetsCacheForTests,
  applyListing,
  findAssetBySymbol,
  pickListingPerCompany,
  searchCatalog,
  type CatalogAsset,
} from "@/lib/catalog/assets";
import {
  evaluateAsset,
  nextSafetyState,
  parseOrderQuote,
  quoteCostBps,
  staticChecks,
} from "@/lib/catalog/safety-core.mjs";
import { isTradableMint, tradableBySymbol } from "@/lib/catalog/tradable";
import {
  buildOndoSeed,
  EXPECTED_COUNTS,
  normalizeVolumeWinner,
  parseOndoCsv,
} from "../../scripts/gen-ondo-seed.mjs";
import { readOndoSymbols } from "../../scripts/sync-xstocks.mjs";
import { readOndoUniverse } from "../../scripts/audit-catalog.mjs";

const ROOT = path.resolve(__dirname, "..", "..");

function seedFromCsv() {
  const { header, rows } = parseOndoCsv(
    readFileSync(path.join(ROOT, "data", "ondo", "ondo-vs-xstocks-2026-10-07.csv"), "utf8"),
  );
  return buildOndoSeed(rows, header);
}

function asset(patch: Partial<CatalogAsset> & { symbol: string; mint: string }): CatalogAsset {
  return {
    name: patch.symbol,
    underlying: patch.symbol.replace(/x$/i, "").replace(/on$/i, ""),
    category: "tech",
    logoLocal: null,
    enabled: true,
    halted: false,
    liquidityUsd: 50_000,
    curated: false,
    issuer: "xstocks",
    companyTicker: patch.symbol.replace(/x$/i, "").replace(/on$/i, ""),
    buy100CostBps: null,
    mode: null,
    period: null,
    openNow: null,
    nextChangeAt: null,
    minOrderUsd: null,
    maxOrderUsd: null,
    safetyStatus: "unknown",
    safetyReasons: [],
    safetyTier: null,
    safetyCheckedAt: null,
    tradable: false,
    underReview: false,
    transitionKept: false,
    ...patch,
  };
}

/** Mint base58 con forma xStocks (`Xs` + 41 caracteres). */
function xsMint(index: number): string {
  const digits = String(index + 11).replaceAll("0", "2");
  return `Xs${digits.padStart(41, "1")}`;
}

function ondoMint(ticker: string): string {
  const entry = ONDO_TICKERS.find((row) => row.ticker === ticker);
  if (!entry) throw new Error(`sin mint Ondo para ${ticker}`);
  return entry.mint;
}

describe("M52b: generador Ondo (conteos exactos del CSV)", () => {
  it("agrega 444, gana Ondo 212, solo Ondo 192 y excluye 6", () => {
    const seed = seedFromCsv();
    expect(seed.counts.included).toBe(EXPECTED_COUNTS.included);
    expect(seed.counts.ondoWinsBoth).toBe(EXPECTED_COUNTS.ondoWinsBoth);
    expect(seed.counts.onlyOndo).toBe(EXPECTED_COUNTS.onlyOndo);
    expect(seed.counts.excluded).toBe(EXPECTED_COUNTS.excluded);
  });

  it("TQQQ/SOXL/SOXS/SQQQ/PSQ y AIon no entran", () => {
    const seed = seedFromCsv();
    const excluded = seed.excluded.map((entry) => entry.ticker);
    for (const ticker of ["TQQQ", "SOXL", "SOXS", "SQQQ", "PSQ", "AI"]) {
      expect(excluded, ticker).toContain(ticker);
    }
    const included = seed.included.map((entry) => entry.ticker);
    for (const ticker of ["TQQQ", "SOXL", "SOXS", "SQQQ", "PSQ", "AI"]) {
      expect(included, ticker).not.toContain(ticker);
    }
    const symbols = seed.included.map((entry) => `${entry.ticker}on`);
    for (const symbol of ["AIon", "PSQon", "SQQQon", "SOXLon", "SOXSon", "TQQQon"]) {
      expect(symbols, symbol).not.toContain(symbol);
    }
  });

  it("UCTT y YEAR entran (empresa operativa y bono corto, no apalancados)", () => {
    const seed = seedFromCsv();
    const byTicker = new Map(seed.included.map((entry) => [entry.ticker, entry]));
    expect(byTicker.get("UCTT")?.kind).toBe("stock");
    expect(byTicker.get("YEAR")?.kind).toBe("etf");
  });

  it("símbolos `<TICKER>on` únicos y mints únicos sin forma `Xs`", () => {
    const seed = seedFromCsv();
    const symbols = seed.included.map((entry) => `${entry.ticker}on`);
    expect(new Set(symbols).size).toBe(symbols.length);
    for (const symbol of symbols) expect(symbol.endsWith("on")).toBe(true);
    const mints = seed.included.map((entry) => entry.mint);
    expect(new Set(mints).size).toBe(mints.length);
    for (const mint of mints) expect(mint.startsWith("Xs")).toBe(false);
  });

  it("el ganador sólo desempata (xstocks/ninguno también cargan su Ondo)", () => {
    const seed = seedFromCsv();
    const byTicker = new Map(seed.included.map((entry) => [entry.ticker, entry]));
    expect(byTicker.get("AAPL")?.volumeWinner).toBe("xstocks");
    expect(normalizeVolumeWinner("ninguno")).toBeNull();
    expect(normalizeVolumeWinner("ondo (solo Ondo)")).toBe("ondo");
    expect(normalizeVolumeWinner("xstocks")).toBe("xstocks");
  });
});

describe("M52b: una ficha por empresa", () => {
  it("curada xStocks operable + Ondo watch → se muestra xStocks", () => {
    const rows = applyListing(
      [
        asset({ symbol: "PGx", name: "Procter & Gamble", underlying: "PG", companyTicker: "PG", mint: xsMint(1), curated: true, safetyStatus: "listed", tradable: true }),
        asset({ symbol: "PGon", name: "Procter & Gamble", underlying: "PG", companyTicker: "PG", mint: ondoMint("PG"), issuer: "ondo", safetyStatus: "watch", tradable: false, underReview: true }),
      ],
      "listed",
    );
    expect(rows.map((row) => row.symbol)).toEqual(["PGx"]);
  });

  it("Ondo listed + xStocks watch → se muestra Ondo", () => {
    const rows = applyListing(
      [
        asset({ symbol: "XYZx", name: "Xyz", underlying: "XYZ", companyTicker: "XYZ", mint: xsMint(2), safetyStatus: "watch", tradable: false, underReview: true }),
        asset({ symbol: "XYZon", name: "Xyz", underlying: "XYZ", companyTicker: "XYZ", mint: "ondo-mint-xyz", issuer: "ondo", safetyStatus: "listed", tradable: true }),
      ],
      "listed",
    );
    expect(rows.map((row) => row.symbol)).toEqual(["XYZon"]);
  });

  it("nunca dos fichas por empresa y el menor costo desempata", () => {
    const candidates = [
      { asset: asset({ symbol: "ABCon", mint: "ondo-mint-abc", issuer: "ondo", safetyStatus: "watch" as const }), companyTicker: "ABC", buy100CostBps: 60, volumeWinner: null as "xstocks" | "ondo" | null },
      { asset: asset({ symbol: "ABCx", mint: xsMint(3), safetyStatus: "watch" as const }), companyTicker: "ABC", buy100CostBps: 30, volumeWinner: null },
      { asset: asset({ symbol: "DEFx", mint: xsMint(4), safetyStatus: "listed" as const, tradable: true }), companyTicker: "DEF", buy100CostBps: null, volumeWinner: null },
    ];
    const rows = pickListingPerCompany(candidates);
    expect(rows.map((row) => row.symbol).sort()).toEqual(["ABCx", "DEFx"]);
  });

  it("en empate total gana el ganador por volumen del CSV", () => {
    const candidates = [
      { asset: asset({ symbol: "GHon", mint: "ondo-mint-gh", issuer: "ondo", safetyStatus: "watch" as const }), companyTicker: "GH", buy100CostBps: 40, volumeWinner: "ondo" as const },
      { asset: asset({ symbol: "GHx", mint: xsMint(5), safetyStatus: "watch" as const }), companyTicker: "GH", buy100CostBps: 40, volumeWinner: "ondo" as const },
    ];
    expect(pickListingPerCompany(candidates).map((row) => row.symbol)).toEqual(["GHon"]);
  });

  it("bySymbol devuelve la ficha elegida y el mercado cuenta empresas", async () => {
    __setAssetsCacheForTests(
      [
        asset({ symbol: "PGx", name: "Procter & Gamble", underlying: "PG", companyTicker: "PG", mint: xsMint(1), curated: true, safetyStatus: "listed", tradable: true }),
        asset({ symbol: "PGon", name: "Procter & Gamble", underlying: "PG", companyTicker: "PG", mint: ondoMint("PG"), issuer: "ondo", safetyStatus: "watch", tradable: false, underReview: true }),
      ],
      Date.now(),
    );
    try {
      const chosen = await findAssetBySymbol("PGon", { scope: "all" });
      expect(chosen?.symbol).toBe("PGx");
      const result = await searchCatalog({ scope: "all", pageSize: 50 });
      expect(result.total).toBe(1);
      expect(result.items.map((row) => row.symbol)).toEqual(["PGx"]);
    } finally {
      __clearAssetsCacheForTests();
    }
  });
});

describe("M52b: staticChecks por emisor", () => {
  it("mint fuera del snapshot Ondo → motivo estático y hidden", () => {
    const reasons = staticChecks({
      node: { symbol: "FAKEon", name: "Fake", mint: xsMint(9), underlyingCurrency: "USD", refPrice: 10 },
      jupToken: null,
      snapshotMint: null,
      issuer: "ondo",
      ondoMints: ONDO_TICKERS.map((entry) => entry.mint),
      ondoKind: "stock",
    });
    expect(reasons).toContain("mint_no_en_registro_ondo");
    const next = nextSafetyState({ safety_status: "watch", consecutive_passes: 1 }, { result: "fail", reasons }, "market");
    expect(next.status).toBe("hidden");
  });

  it("Ondo registrado no pide constantes xStocks ni Jupiter", () => {
    const reasons = staticChecks({
      node: { symbol: "NVDAon", name: "NVIDIA", mint: ondoMint("NVDA"), underlyingCurrency: "USD", refPrice: 100 },
      jupToken: null,
      snapshotMint: null,
      issuer: "ondo",
      ondoMints: ONDO_TICKERS.map((entry) => entry.mint),
      ondoKind: "stock",
    });
    expect(reasons).toEqual([]);
  });

  it("nombre inverso con kind ETF sí se veta aunque el mint esté registrado", () => {
    const reasons = staticChecks({
      node: { symbol: "PSQon", name: "ProShares Short QQQ", mint: ondoMint("AGG"), underlyingCurrency: "USD", refPrice: 10 },
      jupToken: null,
      snapshotMint: null,
      issuer: "ondo",
      ondoMints: ONDO_TICKERS.map((entry) => entry.mint),
      ondoKind: "etf",
    });
    expect(reasons).toContain("producto_apalancado_inverso_o_volatilidad");
  });
});

describe("M52b: allowlist dinámica por emisor", () => {
  afterEach(() => {
    __clearAssetsCacheForTests();
  });

  it("Ondo watch no se opera, Ondo listed sí, mint desconocido no", async () => {
    __setAssetsCacheForTests(
      [
        asset({ symbol: "NVDAon", name: "NVIDIA", underlying: "NVDA", companyTicker: "NVDA", mint: ondoMint("NVDA"), issuer: "ondo", safetyStatus: "watch", tradable: false, underReview: true }),
        asset({ symbol: "ABTon", name: "Abbott", underlying: "ABT", companyTicker: "ABT", mint: ondoMint("ABT"), issuer: "ondo", safetyStatus: "listed", tradable: true }),
      ],
      Date.now(),
    );
    expect(await isTradableMint(ondoMint("NVDA"))).toBe(false);
    expect(await tradableBySymbol("NVDAon")).toBeNull();
    expect(await isTradableMint(ondoMint("ABT"))).toBe(true);
    expect(await tradableBySymbol("ABTon")).toEqual({ symbol: "ABTon", mint: ondoMint("ABT") });
    expect(await isTradableMint("1111111111111111111111111111111111111111111")).toBe(false);
  });

  it("xStocks listed con forma Xs sigue operable", async () => {
    const mint = xsMint(21);
    __setAssetsCacheForTests(
      [asset({ symbol: "AAPLx", name: "Apple", underlying: "AAPL", companyTicker: "AAPL", mint, curated: true, safetyStatus: "listed", tradable: true })],
      Date.now(),
    );
    expect(await isTradableMint(mint)).toBe(true);
  });
});

describe("M52b: parser RFQ de JupiterZ", () => {
  it("orden JupiterZ válida cuenta como ruta", () => {
    const parsed = parseOrderQuote({
      inAmount: "100000000",
      outAmount: "1987654321",
      router: "jupiterz",
      swapType: "rfq",
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.rfq).toBe(true);
    expect(parsed.route.length > 0).toBe(true);
  });

  it("orden AMM con routePlan sigue contando", () => {
    const parsed = parseOrderQuote({
      inAmount: "100000000",
      outAmount: "29867868",
      swapType: "exactIn",
      routePlan: [{ swapInfo: { label: "Raydium" } }],
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.rfq).toBe(false);
  });

  it("sin montos no hay ruta (sin_ruta_compra_100)", () => {
    expect(parseOrderQuote({ router: "jupiterz", swapType: "rfq" }).ok).toBe(false);
    expect(parseOrderQuote({ inAmount: "100", routePlan: [] }).ok).toBe(false);
    const verdict = evaluateAsset({ staticReasons: [], buy100: { ok: false, costBps: NaN } });
    expect(verdict.reasons).toContain("sin_ruta_compra_100");
  });
});

describe("M52b: costos Ondo con decimales reales y sin veto por volumen", () => {
  it("volumen 0 con cotizaciones dentro de umbral pasa", () => {
    const cost = quoteCostBps({ side: "buy", inAmount: 100_000_000, outAmount: 2_000_000_000, multiplier: 1, refPrice: 50, assetDecimals: 9 });
    expect(cost).toBeCloseTo(0, 6);
    const verdict = evaluateAsset({
      staticReasons: [],
      buy100: { ok: true, costBps: cost },
      buy1000: { ok: true, costBps: 40 },
      sell100: { ok: true, costBps: 35 },
      jupUsdPrice: 50,
      refPrice: 50,
      liquidityUsd: 0,
      rfqOnly: true,
    });
    expect(verdict.result).toBe("pass");
  });

  it("compra US$1.000 a 160 bps falla con costo_compra_1000_160bps", () => {
    const verdict = evaluateAsset({
      staticReasons: [],
      buy100: { ok: true, costBps: 20 },
      buy1000: { ok: true, costBps: 160 },
      sell100: { ok: true, costBps: 35 },
      jupUsdPrice: 50,
      refPrice: 50,
      liquidityUsd: 0,
      rfqOnly: true,
    });
    expect(verdict.result).toBe("fail");
    expect(verdict.reasons).toContain("costo_compra_1000_160bps");
  });
});

describe("M52b: migración 0022 idempotente y sin aplicar", () => {
  function sql(): string {
    return readFileSync(path.join(ROOT, "supabase", "migrations", "0022_ondo_issuer.sql"), "utf8");
  }

  it("agrega issuer con check y company_ticker con índice, sin tocar 0001", () => {
    const text = sql();
    expect(text).toMatch(/add column if not exists issuer/i);
    expect(text).toMatch(/issuer in \('xstocks', 'ondo'\)/);
    expect(text).toMatch(/add column if not exists company_ticker/i);
    expect(text).toMatch(/assets_company_ticker_idx/);
    expect(text).toMatch(/set company_ticker = underlying/i);
    // Sólo toca public.assets (nada de 0001 ni de otras tablas).
    const tables = [...text.matchAll(/public\.([a-z_]+)/gi)].map((match) => match[1]);
    expect(new Set(tables)).toEqual(new Set(["assets"]));
    const code = text.replace(/^--.*$/gm, "");
    expect(code).not.toMatch(/pg_catalog\.current_date/);
  });

  it("inserta las 444 filas Ondo en watch con on conflict do nothing", () => {
    const text = sql();
    const inserts = [...text.matchAll(/^insert into public\.assets .*? on conflict \(symbol\) do nothing;$/gm)];
    expect(inserts).toHaveLength(444);
    for (const [line] of inserts) {
      expect(line).toContain(", 'ondo',");
      expect(line).toContain(", 'watch',");
    }
    expect(text).toMatch(/'watch', '\{\}'/);
    expect(text).toContain("('AAPLon', 'Apple', 'AAPL'");
    for (const symbol of ["AIon", "PSQon", "SQQQon", "SOXLon", "SOXSon", "TQQQon"]) {
      expect(text, symbol).not.toContain(`('${symbol}',`);
    }
  });
});

describe("M52b: RLS, sync y auditoría cubren Ondo", () => {
  it("audit-rls sigue cubriendo public.assets", () => {
    const script = readFileSync(path.join(ROOT, "scripts", "audit-rls.mjs"), "utf8");
    expect(script).toMatch(/"assets"/);
    expect(script).toMatch(/A SELECT assets \(lectura\)/);
  });

  it("sync-xstocks filtra los símbolos Ondo del upsert", () => {
    const script = readFileSync(path.join(ROOT, "scripts", "sync-xstocks.mjs"), "utf8");
    expect(script).toMatch(/readOndoSymbols/);
    expect(script).toMatch(/!ondoSymbols\.has/);
    expect(readOndoSymbols().size).toBe(444);
    expect(readOndoSymbols().has("NVDAon")).toBe(true);
  });

  it("la auditoría lee el universo Ondo y cachea cotizaciones por sesión", () => {
    const script = readFileSync(path.join(ROOT, "scripts", "audit-catalog.mjs"), "utf8");
    expect(script).toMatch(/readOndoUniverse/);
    expect(script).toMatch(/parseOrderQuote/);
    expect(script).toMatch(/quote:\$\{quoteSession\}/);
    expect(script).toMatch(/0022 sin aplicar/);
    const universe = readOndoUniverse();
    expect(universe).toHaveLength(444);
    expect(universe.find((entry) => entry.symbol === "NVDAon")?.mint).toBe(ondoMint("NVDA"));
  });
});

import { describe, expect, it } from "vitest";

import { CURATED_SYMBOLS } from "@/config/curated-symbols";
import { GENERATED_TICKERS } from "@/config/tickers.generated";
import { TICKERS } from "@/config/tickers";
import {
  displayNameFromApi,
  logoPathFor,
  parseXstocksNode,
  safeLogoFileName,
  selectCurated,
  solanaMintFromNode,
} from "@/lib/catalog/xstocks";

const HISTORIC_MINTS: Record<string, string> = {
  AAPLx: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
  NVDAx: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
  TSLAx: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
  SPYx: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
  QQQx: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
  GOOGLx: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN",
  MSFTx: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",
  AMZNx: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg",
  METAx: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu",
  CRCLx: "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1",
  HOODx: "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg",
  MSTRx: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ",
};

function sampleNode() {
  return {
    id: "abc-123",
    symbol: "AAPLx",
    name: "Apple xStock",
    underlyingSymbol: "AAPL",
    underlying: {
      symbol: "AAPL",
      currency: "USD",
      exchange: { mic: "XNAS", name: "Nasdaq", timezone: "America/New_York" },
    },
    logo: "https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png",
    isTradingHalted: false,
    trading: {
      tradingHoursMode: "TwentyFourFive",
      isTradingHalted: false,
      currentPeriod: "overnight",
      openNow: false,
      nextChangeAt: "2026-10-07T13:30:00.000Z",
      limitsPerPeriod: { overnight: { minOrderFiatValue: 100, maxOrderFiatValue: 100000 } },
    },
    deployments: [
      { network: "Mantle", address: "0xabc" },
      { network: "Solana", address: HISTORIC_MINTS.AAPLx },
    ],
  };
}

describe("catálogo xstocks", () => {
  it("saca el mint de Solana, los límites y el horario del nodo", () => {
    const node = sampleNode();
    expect(solanaMintFromNode(node)).toBe(HISTORIC_MINTS.AAPLx);
    const parsed = parseXstocksNode(node);
    expect(parsed?.symbol).toBe("AAPLx");
    expect(parsed?.mintSolana).toBe(HISTORIC_MINTS.AAPLx);
    expect(parsed?.tradingHoursMode).toBe("TwentyFourFive");
    expect(parsed?.isTradingHalted).toBe(false);
    expect(parsed?.currentPeriod).toBe("overnight");
    expect(parsed?.openNow).toBe(false);
    expect(parsed?.limits).toEqual({
      overnight: { minOrderFiatValue: 100, maxOrderFiatValue: 100000 },
    });
    expect(parsed?.exchangeMic).toBe("XNAS");
  });

  it("ignora deployments sin Solana", () => {
    expect(solanaMintFromNode({ deployments: [{ network: "Mantle", address: "0x1" }] })).toBeNull();
    expect(solanaMintFromNode({ deployments: [] })).toBeNull();
  });

  it("la curada trae 50 símbolos conocidos en USD", () => {
    expect(CURATED_SYMBOLS).toHaveLength(50);
    const symbols = new Set(CURATED_SYMBOLS.map((entry) => entry.symbol));
    for (const symbol of Object.keys(HISTORIC_MINTS)) {
      expect(symbols.has(symbol)).toBe(true);
    }
    expect(symbols.has("BRK.Bx")).toBe(true);
  });

  it("selecciona sólo los curados", () => {
    const assets = [{ symbol: "AAPLx" }, { symbol: "FAKEx" }, { symbol: "SPYx" }];
    const picked = selectCurated(assets, new Set(["AAPLx", "SPYx"]));
    expect(picked.map((item) => item.symbol).sort()).toEqual(["AAPLx", "SPYx"]);
  });

  it("nombres de logo seguros (BRK.Bx -> brk-b.png)", () => {
    expect(safeLogoFileName("AAPL")).toBe("aapl.png");
    expect(safeLogoFileName("BRK.B")).toBe("brk-b.png");
    expect(logoPathFor("BRK.B")).toBe("/logos/brk-b.png");
    expect(displayNameFromApi("Apple xStock", "AAPLx", "AAPL")).toBe("Apple");
  });

  it("los 12 mints históricos no cambian", () => {
    for (const [symbol, mint] of Object.entries(HISTORIC_MINTS)) {
      const ticker = TICKERS.find((item) => item.symbol === symbol);
      expect(ticker?.mint, symbol).toBe(mint);
      const generated = GENERATED_TICKERS.find((item) => item.symbol === symbol);
      expect(generated?.mint, symbol).toBe(mint);
    }
  });

  it("HOODx y MSTRx quedan habilitados", () => {
    expect(TICKERS.find((item) => item.symbol === "HOODx")?.enabled).toBe(true);
    expect(TICKERS.find((item) => item.symbol === "MSTRx")?.enabled).toBe(true);
  });
});

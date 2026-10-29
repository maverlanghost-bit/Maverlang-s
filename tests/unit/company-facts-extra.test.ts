import { describe, expect, it } from "vitest";

import { factKind, holdingsOrNull, latestFiling } from "../../lib/market/fundamentals";
import {
  foreignMetricsFromCompanyFacts,
  indexFundTickers,
  latestFundFilingFromAtom,
  nportPrimaryDocUrl,
  parseNport,
  tidyHoldingName,
} from "../../lib/services/company-facts";

const annual = (val: number, end: string, form = "20-F") => ({
  start: `${Number(end.slice(0, 4)) - 1}${end.slice(4, 8)}${String(Number(end.slice(8)) + 1).padStart(2, "0")}`,
  end,
  val,
  form,
  filed: end,
});

describe("emisores extranjeros (20-F)", () => {
  const body = {
    facts: {
      "ifrs-full": {
        Revenue: { units: { EUR: [annual(900, "2025-12-30")] } },
        ProfitLossAttributableToOwnersOfParent: { units: { EUR: [annual(-90, "2025-12-30")] } },
      },
    },
  };
  it("convierte a USD con el tipo de cambio", () => {
    const m = foreignMetricsFromCompanyFacts(body, (c) => (c === "EUR" ? 0.9 : null), "2026-10-29");
    expect(m.revenueUsd).toBe(1000);
    expect(m.netIncomeUsd).toBe(-100);
    expect(m.currency).toBe("EUR");
  });
  it("sin tipo de cambio no inventa cifra", () => {
    const m = foreignMetricsFromCompanyFacts(body, () => null, "2026-10-29");
    expect(m.revenueUsd).toBeNull();
    expect(m.netIncomeUsd).toBeNull();
  });
  it("un año muy viejo no se muestra", () => {
    const m = foreignMetricsFromCompanyFacts(body, () => 0.9, "2029-01-01");
    expect(m.revenueUsd).toBeNull();
  });
});

describe("fondos (N-PORT)", () => {
  it("indexa tickers de fondos", () => {
    const map = indexFundTickers({ data: [[1100663, "S000004310", "C000012040", "IVV"]] });
    expect(map.get("IVV")).toEqual({ cik: "0001100663", seriesId: "S000004310" });
  });
  it("lee el feed atom y arma la URL del documento", () => {
    const atom =
      "<feed><entry><filing-date>2026-08-28</filing-date><filing-href>https://www.sec.gov/Archives/edgar/data/1100663/000207169126019760/0002071691-26-019760-index.htm</filing-href></entry></feed>";
    const found = latestFundFilingFromAtom(atom);
    expect(found?.filingDate).toBe("2026-08-28");
    expect(nportPrimaryDocUrl(found!.indexUrl)).toMatch(/\/primary_doc\.xml$/);
    expect(latestFundFilingFromAtom("<entry><filing-href>https://evil.example/x</filing-href></entry>")).toBeNull();
  });
  it("resume patrimonio y mayores posiciones", () => {
    const xml =
      "<genInfo><regName>iShares Trust</regName><seriesName>iShares Core S&amp;P 500 ETF</seriesName><repPdDate>2026-06-30</repPdDate></genInfo><fundInfo><netAssets>1000.4</netAssets></fundInfo>" +
      "<invstOrSec><name>APPLE INC</name><pctVal>7.1234</pctVal></invstOrSec><invstOrSec><name>NVIDIA CORP</name><pctVal>8</pctVal></invstOrSec><invstOrSec><name>N/A</name><pctVal>1</pctVal></invstOrSec>";
    const s = parseNport(xml);
    expect(s.seriesName).toBe("iShares Core S&P 500 ETF");
    expect(s.netAssets).toBe(1000);
    expect(s.holdingsCount).toBe(3);
    expect(s.top).toEqual([
      { name: "Nvidia Corp", pct: 8 },
      { name: "Apple Inc", pct: 7.12 },
    ]);
  });
  it("nombres", () => {
    expect(tidyHoldingName("ALPHABET INC-CL A")).toBe("Alphabet Inc-Cl A");
    expect(tidyHoldingName("Meta Platforms")).toBe("Meta Platforms");
  });
});

describe("vista", () => {
  it("tipo por formulario", () => {
    expect(factKind("NPORT-P")).toBe("fund");
    expect(factKind("20-F")).toBe("foreign");
    expect(factKind("10-K")).toBe("company");
  });
  it("último informe según tipo", () => {
    expect(latestFiling({ last10k: null, last10q: "2026-08-28", lastFilingForm: "NPORT-P" })).toEqual({
      form: "N-PORT",
      date: "2026-08-28",
    });
    expect(latestFiling({ last10k: "2026-04-01", last10q: null, lastFilingForm: "20-F" })).toEqual({
      form: "20-F",
      date: "2026-04-01",
    });
  });
  it("posiciones inválidas → null", () => {
    expect(holdingsOrNull([{ name: "", pct: 1 }, { name: "x", pct: 0 }])).toBeNull();
    expect(holdingsOrNull("x")).toBeNull();
  });
});

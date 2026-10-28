import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { empresaCopy } from "@/content/i18n/extra-empresa";
import { FRESH_SHARES_DAYS, daysBetween } from "@/lib/services/company-facts";
import {
  SHARES_MAX_AGE_DAYS,
  calendarDaysBetween,
  companyView,
  dividendYield,
  formatIsoDate,
  formatMultiple,
  formatUsdAmount,
  formatUsdCompact,
  formatYield,
  latestFiling,
  marketCapUsd,
  numericOrNull,
  priceToEarnings,
  readCompanyFactsView,
  secSourceUrl,
  type CompanyFactsInput,
} from "@/lib/market/fundamentals";

const ROOT = path.resolve(__dirname, "..", "..");

function sample(overrides: Partial<CompanyFactsInput> = {}): CompanyFactsInput {
  return {
    symbol: "AAPLx",
    underlying: "AAPL",
    name: "Apple Inc.",
    sector: "Electronic Computers",
    sic: "3571",
    exchange: "Nasdaq",
    fiscalYearEnd: "0926",
    sharesOutstanding: 100,
    sharesAsOf: "2026-07-01",
    lastClose: 20,
    lastCloseDate: "2026-07-17",
    epsTtm: 4,
    epsPeriodEnd: "2026-06-27",
    revenueTtm: 1000,
    netIncomeTtm: -50,
    dividendsPerShareTtm: 1,
    last10k: "2025-10-31",
    last10q: "2026-07-31",
    lastFilingForm: "10-Q",
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/320193/doc.htm",
    updatedAt: "2026-07-31T12:00:00Z",
    ...overrides,
  };
}

describe("cálculos de la ficha", () => {
  it("usa la misma ventana de recuento que el cargador de EDGAR", () => {
    expect(SHARES_MAX_AGE_DAYS).toBe(450);
    expect(FRESH_SHARES_DAYS).toBe(SHARES_MAX_AGE_DAYS);
    expect(calendarDaysBetween("2024-01-01", "2024-03-31")).toBe(90);
    expect(calendarDaysBetween("2026-07-17", "2011-04-29")).toBe(daysBetween("2026-07-17", "2011-04-29"));
    expect(calendarDaysBetween("2026-02-31", "2026-03-01")).toBeNull();
  });

  it("capitalización = acciones × último cierre, y queda vacía si el recuento no es reciente", () => {
    expect(marketCapUsd(100, 20, "2026-07-01", "2026-07-17")).toBe(2000);
    expect(marketCapUsd(null, 20, "2026-07-01", "2026-07-17")).toBeNull();
    expect(marketCapUsd(100, null, "2026-07-01", "2026-07-17")).toBeNull();
    expect(marketCapUsd(0, 20, "2026-07-01", "2026-07-17")).toBeNull();
    expect(marketCapUsd(-5, 20, "2026-07-01", "2026-07-17")).toBeNull();
    expect(marketCapUsd(100, 20, null, "2026-07-17")).toBeNull();
    expect(marketCapUsd(100, 20, "2011-04-29", "2026-07-17")).toBeNull();
  });

  it("P/E queda vacío si el EPS no es positivo", () => {
    expect(priceToEarnings(100, 4)).toBe(25);
    expect(priceToEarnings(100, 0)).toBeNull();
    expect(priceToEarnings(100, -2)).toBeNull();
    expect(priceToEarnings(null, 4)).toBeNull();
    expect(priceToEarnings(0, 4)).toBeNull();
  });

  it("el rendimiento es dividendos TTM / cierre, y 0 no se inventa cuando falta el dividendo", () => {
    expect(dividendYield(1, 50)).toBeCloseTo(0.02);
    expect(dividendYield(0, 50)).toBe(0);
    expect(dividendYield(null, 50)).toBeNull();
    expect(dividendYield(1, null)).toBeNull();
    expect(dividendYield(1, 0)).toBeNull();
    expect(dividendYield(-1, 50)).toBeNull();
  });

  it("arma la ficha con la fuente SEC y descarta un enlace que no es de la SEC", () => {
    const view = companyView(sample());
    expect(view.marketCapUsd).toBe(2000);
    expect(view.pe).toBe(5);
    expect(view.dividendYield).toBeCloseTo(0.05);
    expect(view.netIncomeTtm).toBe(-50);
    expect(view.source).toBe("sec-edgar");
    expect(view.sourceUrl).toContain("www.sec.gov");
    expect(companyView(sample({ sourceUrl: "https://evil.example/a" })).sourceUrl).toBeNull();
    expect(companyView(sample({ sourceUrl: "http://www.sec.gov/a" })).sourceUrl).toBeNull();
    expect(companyView(sample({ sharesOutstanding: -3 })).sharesOutstanding).toBeNull();
    expect(companyView(sample({ epsTtm: -1 })).pe).toBeNull();
    expect(companyView(sample({ epsTtm: -1 })).epsTtm).toBe(-1);
    expect(secSourceUrl("no es url")).toBeNull();
  });

  it("lee números de Postgres y no acepta una ficha incompleta", () => {
    expect(numericOrNull("189.2500")).toBe(189.25);
    expect(numericOrNull("")).toBeNull();
    expect(numericOrNull("no")).toBeNull();
    const view = companyView(sample());
    expect(readCompanyFactsView(view)?.symbol).toBe("AAPLx");
    const broken = { ...view } as { pe?: number | null };
    delete broken.pe;
    expect(readCompanyFactsView(broken)).toBeNull();
    expect(readCompanyFactsView({ ...view, source: "otro" })).toBeNull();
  });

  it("formatea la fecha de calendario sin correr el día, y el último informe", () => {
    const formatted = formatIsoDate("2026-07-31", "es-CL");
    expect(formatted).toContain("31");
    expect(formatted).toContain("2026");
    expect(formatIsoDate("2026-02-31", "en")).toBeNull();
    expect(formatUsdCompact(1_500_000_000, "en")).toMatch(/1/);
    expect(formatUsdCompact(-20_000_000, "es-CL")).toMatch(/20/);
    expect(formatUsdAmount(1.57, "en")).toContain("1.57");
    expect(formatMultiple(28.44, "es-CL")).toMatch(/28/);
    expect(formatYield(0.015, "en")).toContain("1.50");
    expect(latestFiling({ last10k: "2025-10-31", last10q: "2026-07-31", lastFilingForm: "10-Q" })).toEqual({
      form: "10-Q",
      date: "2026-07-31",
    });
    expect(latestFiling({ last10k: "2025-10-31", last10q: null, lastFilingForm: null })).toEqual({
      form: "10-K",
      date: "2025-10-31",
    });
  });
});

describe("textos de la ficha", () => {
  it("es-CL y en tienen la misma forma, y el aviso no recomienda", () => {
    expect(keys(empresaCopy.en)).toEqual(keys(empresaCopy.esCL));
    expect(empresaCopy.esCL.disclaimer).toBe("Solo informativo, no es una recomendación");
    expect(empresaCopy.en.disclaimer.toLowerCase()).toContain("not a recommendation");
    const blob = JSON.stringify(empresaCopy).toLowerCase();
    expect(blob).not.toMatch(/\bcompra\b|\bvende\b|\bbuy\b|\bsell\b|analista|analyst/);
    for (const field of Object.values(empresaCopy.esCL.fields)) {
      expect(field.about.length).toBeGreaterThan(40);
    }
  });

  it("la tarjeta exporta CompanyCard y muestra el aviso y la fuente", () => {
    const source = readFileSync(path.join(ROOT, "components/domain/company-card.tsx"), "utf8");
    expect(source).toContain("export function CompanyCard");
    expect(source).toContain("copy.disclaimer");
    expect(source).toContain("copy.sourceName");
    expect(source).toContain("copy.what");
    expect(empresaCopy.esCL.what).toBe("¿Qué es esto?");
    expect(empresaCopy.en.what).toBe("What is this?");
    expect(source).not.toContain("company-facts.supabase");
    expect(source).not.toMatch(/\bcompra\b|\bvende\b|\bbuy\b|\bsell\b/);
  });
});

function keys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  const found: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) found.push(...keys(entry, next));
    else found.push(next);
  }
  return found;
}

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  EDGAR_MAX_REQUESTS_PER_SECOND,
  EDGAR_MIN_INTERVAL_MS,
  EDGAR_USER_AGENT,
  buildCompanyFactRecord,
  describeFilings,
  edgarCompanyFactsUrl,
  edgarSubmissionsUrl,
  filingDocumentUrl,
  indexCompanyTickers,
  metricsFromCompanyFacts,
  olderSubmissionNames,
  olderSubmissionUrl,
  preferredUnderlyingRaw,
  profileFromSubmissions,
  trailingTwelveMonths,
  type EdgarFact,
} from "@/lib/services/company-facts";

const ROOT = path.resolve(__dirname, "..", "..");

function fact(partial: Partial<EdgarFact> & Pick<EdgarFact, "end" | "val">): EdgarFact {
  return {
    form: "10-Q",
    filed: partial.end,
    ...partial,
  };
}

const quarters: EdgarFact[] = [
  fact({ start: "2024-01-01", end: "2024-03-31", val: 1, fp: "Q1", filed: "2024-05-01" }),
  fact({ start: "2024-04-01", end: "2024-06-30", val: 1.1, fp: "Q2", filed: "2024-08-01" }),
  fact({ start: "2024-07-01", end: "2024-09-30", val: 1.2, fp: "Q3", filed: "2024-11-01" }),
  fact({ start: "2024-10-01", end: "2024-12-31", val: 1.3, fp: "Q4", form: "10-K", filed: "2025-02-01" }),
];

const ytd: EdgarFact = fact({
  start: "2024-01-01",
  end: "2024-09-30",
  val: 99,
  fp: "Q3",
  filed: "2024-11-01",
});

const annual: EdgarFact = fact({
  start: "2024-01-01",
  end: "2024-12-31",
  val: 50,
  fp: "FY",
  form: "10-K",
  filed: "2025-02-01",
});

function conceptBody(
  entries: Record<string, { unit: string; facts: unknown[]; taxonomy?: string }>,
): unknown {
  const facts: Record<string, Record<string, { units: Record<string, unknown[]> }>> = {};
  for (const [name, entry] of Object.entries(entries)) {
    const taxonomy = entry.taxonomy ?? "us-gaap";
    facts[taxonomy] ??= {};
    facts[taxonomy][name] = { units: { [entry.unit]: entry.facts } };
  }
  return { facts };
}

describe("TTM de EDGAR", () => {
  it("suma 4 trimestres y deja fuera el acumulado y el anual", () => {
    const found = trailingTwelveMonths([...quarters, ytd, annual], { perShare: true });
    expect(found?.periodEnd).toBe("2024-12-31");
    expect(found?.value).toBeCloseTo(4.6);
    expect(found?.value).not.toBe(50);
    expect(found?.value).not.toBe(99);
  });

  it("si falta un trimestre y no hay uno posterior, el total es el anual", () => {
    const found = trailingTwelveMonths([quarters[0]!, quarters[1]!, quarters[2]!, annual]);
    expect(found?.periodEnd).toBe("2024-12-31");
    expect(found?.value).toBeCloseTo(50);
  });

  it("un hueco dentro del año, sin trimestres posteriores, equivale al anual", () => {
    const found = trailingTwelveMonths([quarters[0]!, quarters[1]!, quarters[3]!, annual]);
    expect(found?.periodEnd).toBe("2024-12-31");
    expect(found?.value).toBeCloseTo(50);
  });

  it("en el mismo cierre gana el presentado después, y un instantáneo no entra", () => {
    const restated = fact({
      start: "2024-01-01",
      end: "2024-03-31",
      val: 1.5,
      filed: "2024-08-01",
    });
    const instant = fact({
      start: "2024-10-01",
      end: "2024-12-31",
      val: 80,
      frame: "CY2024Q4I",
      form: "10-K",
    });
    const found = trailingTwelveMonths([quarters[0]!, restated, quarters[1]!, quarters[2]!, quarters[3]!, instant], {
      perShare: true,
    });
    expect(found?.value).toBeCloseTo(5.1);
  });

  it("prefiere el EPS diluido; si no está, usa el básico", () => {
    const dilutedAnnual = {
      start: "2024-01-01",
      end: "2024-12-31",
      val: 9,
      fp: "FY",
      form: "10-K",
      filed: "2025-02-01",
    };
    const basicQuarters = quarters.map((row) => ({ ...row }));
    const dilutedFirst = metricsFromCompanyFacts(
      conceptBody({
        EarningsPerShareDiluted: { unit: "USD/shares", facts: [dilutedAnnual] },
        EarningsPerShareBasic: { unit: "USD/shares", facts: basicQuarters },
      }),
    );
    expect(dilutedFirst.epsTtm).toBe(9);
    expect(dilutedFirst.epsPeriodEnd).toBe("2024-12-31");

    const basicOnly = metricsFromCompanyFacts(
      conceptBody({
        EarningsPerShareBasic: { unit: "USD/shares", facts: basicQuarters },
      }),
    );
    expect(basicOnly.epsTtm).toBeCloseTo(4.6);
  });

  it("una serie más nueva gana a un concepto viejo, aunque esté primero", () => {
    const staleRevenue = [10, 20, 30, 40].map((val, index) => ({
      start: ["2018-01-01", "2018-04-01", "2018-07-01", "2018-10-01"][index],
      end: ["2018-03-31", "2018-06-30", "2018-09-30", "2018-12-31"][index],
      val: val * 1_000_000_000,
      fp: "Q4",
      form: "10-K",
      filed: "2019-02-01",
    }));
    const year = {
      start: "2024-09-29",
      end: "2025-09-27",
      val: 1000,
      fp: "FY",
      form: "10-K",
      filed: "2025-10-31",
    };
    const inside = [
      { start: "2024-09-29", end: "2024-12-28", val: 200 },
      { start: "2024-12-29", end: "2025-03-29", val: 200 },
      { start: "2025-03-30", end: "2025-06-28", val: 200 },
    ];
    const after = [
      { start: "2025-09-28", end: "2025-12-27", val: 210 },
      { start: "2025-12-28", end: "2026-03-28", val: 220 },
      { start: "2026-03-29", end: "2026-06-27", val: 230 },
    ];
    const fresh = [...inside, ...after, year].map((row) => ({
      ...row,
      fp: "fp" in row ? row.fp : "Q1",
      form: "form" in row ? row.form : "10-Q",
      filed: "filed" in row ? row.filed : row.end,
    }));
    const metrics = metricsFromCompanyFacts(
      conceptBody({
        Revenues: { unit: "USD", facts: staleRevenue },
        RevenueFromContractWithCustomerExcludingAssessedTax: { unit: "USD", facts: fresh },
      }),
    );
    expect(metrics.revenueTtm).toBeCloseTo(1060);
    expect(metrics.revenueTtm).not.toBe(100_000_000_000);
  });

  it("no publica el anual si ya hay un trimestre posterior y falta más de un cuarto", () => {
    const year = fact({
      start: "2024-09-29",
      end: "2025-09-27",
      val: 7.46,
      fp: "FY",
      form: "10-K",
      filed: "2025-10-31",
    });
    const later = [
      fact({ start: "2025-09-28", end: "2025-12-27", val: 2.84, fp: "Q1", filed: "2026-01-30" }),
      fact({ start: "2025-12-28", end: "2026-03-28", val: 2.01, fp: "Q2", filed: "2026-05-01" }),
      fact({ start: "2026-03-29", end: "2026-06-27", val: 2.02, fp: "Q3", filed: "2026-07-31" }),
    ];
    const found = trailingTwelveMonths([year, ...later], { perShare: true });
    expect(found).toBeNull();
  });

  it("arma el trimestre que falta en el año y lo suma con los tres siguientes", () => {
    const year = fact({
      start: "2024-09-29",
      end: "2025-09-27",
      val: 7.46,
      fp: "FY",
      form: "10-K",
      filed: "2025-10-31",
    });
    const rows = [
      fact({ start: "2024-09-29", end: "2024-12-28", val: 2.4, fp: "Q1", filed: "2025-01-31" }),
      fact({ start: "2024-12-29", end: "2025-03-29", val: 1.65, fp: "Q2", filed: "2025-05-02" }),
      fact({ start: "2025-03-30", end: "2025-06-28", val: 1.57, fp: "Q3", filed: "2025-08-01" }),
      fact({ start: "2025-09-28", end: "2025-12-27", val: 2.84, fp: "Q1", filed: "2026-01-30" }),
      fact({ start: "2025-12-28", end: "2026-03-28", val: 2.01, fp: "Q2", filed: "2026-05-01" }),
      fact({ start: "2026-03-29", end: "2026-06-27", val: 2.02, fp: "Q3", filed: "2026-07-31" }),
      year,
    ];
    const found = trailingTwelveMonths(rows, { perShare: true });
    expect(found?.periodEnd).toBe("2026-06-27");
    expect(found?.value).toBeCloseTo(8.71);
  });

  it("el EPS básico más nuevo gana al diluido que se quedó atrás", () => {
    const dilutedAnnual = {
      start: "2018-01-01",
      end: "2018-12-31",
      val: 9,
      fp: "FY",
      form: "10-K",
      filed: "2019-02-01",
    };
    const metrics = metricsFromCompanyFacts(
      conceptBody({
        EarningsPerShareDiluted: { unit: "USD/shares", facts: [dilutedAnnual] },
        EarningsPerShareBasic: { unit: "USD/shares", facts: quarters.map((row) => ({ ...row })) },
      }),
    );
    expect(metrics.epsTtm).toBeCloseTo(4.6);
    expect(metrics.epsPeriodEnd).toBe("2024-12-31");
  });

  it("ingresos, utilidad y dividendo salen de los conceptos pedidos", () => {
    const money = [10, 20, 30, 40].map((val, index) => ({ ...quarters[index]!, val }));
    const metrics = metricsFromCompanyFacts(
      conceptBody({
        RevenueFromContractWithCustomerExcludingAssessedTax: { unit: "USD", facts: money },
        NetIncomeLoss: { unit: "USD", facts: money.map((row) => ({ ...row, val: -row.val })) },
        CommonStockDividendsPerShareDeclared: {
          unit: "USD/shares",
          facts: money.map((row) => ({ ...row, val: -1 })),
        },
        CommonStockDividendsPerShareCashPaid: {
          unit: "USD/shares",
          facts: [{ start: "2024-01-01", end: "2024-12-31", val: 1.02, fp: "FY", form: "10-K", filed: "2025-02-01" }],
        },
      }),
    );
    expect(metrics.revenueTtm).toBe(100);
    expect(metrics.netIncomeTtm).toBe(-100);
    expect(metrics.dividendsPerShareTtm).toBeCloseTo(1.02);
  });

  it("las acciones son la cifra positiva más reciente, sin segmentos ni 8-K", () => {
    const metrics = metricsFromCompanyFacts(
      conceptBody({
        EntityCommonStockSharesOutstanding: {
          taxonomy: "dei",
          unit: "shares",
          facts: [
            { end: "2026-07-17", val: 100, form: "10-Q", filed: "2026-07-31", segments: { Class: "A" } },
            { end: "2026-07-20", val: 300, form: "8-K", filed: "2026-07-21" },
            { end: "2026-04-17", val: 9, form: "10-Q", filed: "2026-05-01" },
            { end: "2026-01-16", val: 0, form: "10-Q", filed: "2026-01-30" },
            { end: "2011-04-29", val: 5, form: "10-Q", filed: "2011-05-06" },
          ],
        },
      }),
    );
    expect(metrics.sharesOutstanding).toBe(9);
    expect(metrics.sharesAsOf).toBe("2026-04-17");
  });
});

describe("fila, CIK e informes", () => {
  it("normaliza el CIK, el ticker y el subyacente como el historial", () => {
    expect(EDGAR_USER_AGENT).toBe("Maverlang hola@maverlang.com");
    expect(EDGAR_MAX_REQUESTS_PER_SECOND).toBe(4);
    expect(EDGAR_MIN_INTERVAL_MS).toBe(250);
    expect(edgarSubmissionsUrl(320193)).toBe("https://data.sec.gov/submissions/CIK0000320193.json");
    expect(edgarCompanyFactsUrl("0000320193")).toBe(
      "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json",
    );
    const map = indexCompanyTickers({
      "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
      "1": { cik_str: 1, ticker: "BRK.B", title: "primero" },
      "2": { cik_str: 2, ticker: "BRK-B", title: "segundo" },
    });
    expect(map.get("AAPL")).toBe("0000320193");
    expect(map.get("BRK-B")).toBe("0000000001");
    expect(preferredUnderlyingRaw({ tickerUnderlying: "BRK.B", assetUnderlying: "OTRO" })).toBe("BRK.B");
    expect(preferredUnderlyingRaw({ tickerUnderlying: "  ", assetUnderlying: "", companyTicker: "AAL" })).toBe("AAL");
  });

  it("arma el enlace al 10-Q más reciente y no acepta un archivo ajeno", () => {
    const filings = describeFilings(
      [
        {
          form: "10-Q",
          filingDate: "2026-07-31",
          accessionNumber: "0000320193-26-000020",
          primaryDocument: "aapl-20260627.htm",
        },
        {
          form: "10-K",
          filingDate: "2025-10-31",
          accessionNumber: "0000320193-25-000079",
          primaryDocument: "aapl-20250927.htm",
        },
        {
          form: "10-K/A",
          filingDate: "2025-12-01",
          accessionNumber: "0000320193-25-000080",
          primaryDocument: "aapl-10ka.htm",
        },
        {
          form: "8-K",
          filingDate: "2026-08-01",
          accessionNumber: "0000320193-26-000099",
          primaryDocument: "skip.htm",
        },
      ],
      320193,
    );
    expect(filings.last10q).toBe("2026-07-31");
    expect(filings.last10k).toBe("2025-12-01");
    expect(filings.lastFilingForm).toBe("10-Q");
    expect(filings.sourceUrl).toBe(
      "https://www.sec.gov/Archives/edgar/data/320193/000032019326000020/aapl-20260627.htm",
    );
    expect(filingDocumentUrl(320193, "0000320193-26-000020", "../secret.htm")).toBeNull();
    const profile = profileFromSubmissions({
      name: "Apple Inc.",
      sic: "3571",
      sicDescription: "Electronic Computers",
      exchanges: ["Nasdaq"],
      fiscalYearEnd: "0926",
      filings: { files: [{ name: "CIK0000320193-submissions-001.json" }, { name: "../evil.json" }] },
    });
    expect(profile).toMatchObject({
      name: "Apple Inc.",
      sic: "3571",
      sicDescription: "Electronic Computers",
      exchange: "Nasdaq",
      fiscalYearEnd: "0926",
    });
    expect(profileFromSubmissions({ fiscalYearEnd: "1340" }).fiscalYearEnd).toBeNull();
    expect(olderSubmissionNames({ filings: { files: [{ name: "CIK0000320193-submissions-001.json" }, { name: "../evil.json" }] } })).toEqual([
      "CIK0000320193-submissions-001.json",
    ]);
    expect(olderSubmissionUrl("../evil.json")).toBeNull();
  });

  it("no crea fila si no hay cifra usable, y sí la crea con EPS o con acciones recientes", () => {
    const empty = {
      sharesOutstanding: null,
      sharesAsOf: null,
      epsTtm: null,
      epsPeriodEnd: null,
      revenueTtm: null,
      netIncomeTtm: null,
      dividendsPerShareTtm: null,
    };
    const profile = {
      name: null,
      sic: null,
      sicDescription: null,
      exchange: null,
      fiscalYearEnd: null,
    };
    const filings = { last10k: null, last10q: null, lastFilingForm: null, sourceUrl: null };
    expect(
      buildCompanyFactRecord({
        underlying: "AAPL",
        cik: 320193,
        metrics: { ...empty, sharesOutstanding: 941481, sharesAsOf: "2011-04-29" },
        profile,
        filings,
        today: "2026-07-17",
      }),
    ).toBeNull();
    const fresh = buildCompanyFactRecord({
      underlying: "AAPL",
      cik: 320193,
      metrics: { ...empty, sharesOutstanding: 10, sharesAsOf: "2026-07-01" },
      profile,
      filings,
      today: "2026-07-17",
    });
    expect(fresh?.cik).toBe("0000320193");
    expect(fresh?.shares_outstanding).toBe(10);
    const loss = buildCompanyFactRecord({
      underlying: "AAPL",
      cik: "0000320193",
      metrics: { ...empty, epsTtm: -2, epsPeriodEnd: "2026-06-27" },
      profile,
      filings,
      today: "2026-07-17",
    });
    expect(loss?.eps_ttm).toBe(-2);
  });
});

describe("archivos de la ficha", () => {
  it("la migración es solo aditiva y queda cerrada al navegador", () => {
    const sql = readFileSync(path.join(ROOT, "supabase/migrations/0034_company_facts.sql"), "utf8").toLowerCase();
    expect(sql).toContain("create table if not exists public.company_facts");
    expect(sql).toContain("underlying");
    expect(sql).toContain("shares_outstanding");
    expect(sql).toContain("eps_ttm");
    expect(sql).toContain("dividends_per_share_ttm");
    expect(sql).toContain("source_url");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.company_facts from public, anon, authenticated");
    expect(sql).not.toContain("drop ");
  });

  it("la ruta resuelve el símbolo, responde 404 y cachea una hora", () => {
    const route = readFileSync(path.join(ROOT, "app/api/tickers/[symbol]/company/route.ts"), "utf8");
    expect(route).toContain("requireVisibleSymbol");
    expect(route).toContain("historyParamsSchema");
    expect(route).toContain("NOT_FOUND");
    expect(route).toContain("s-maxage=3600");
    expect(route).toContain("readCompanyForSymbol");
  });

  it("el cargador usa EDGAR a 4 req/s y no usa fuentes con licencia incompatible", () => {
    const script = readFileSync(path.join(ROOT, "scripts/company-facts.mjs"), "utf8");
    expect(script).toContain("EDGAR_USER_AGENT");
    expect(script).toContain("EDGAR_MIN_INTERVAL_MS");
    expect(script).toContain("buyableAssetRows");
    expect(script).toContain("toYahooSymbol");
    expect(script).toContain("--dry-run");
    expect(script).toContain('onConflict: "underlying"');
    expect(script).not.toMatch(/finance\.yahoo|quoteSummary|finnhub|alphavantage|financialmodelingprep/i);
    const workflow = readFileSync(path.join(ROOT, ".github/workflows/company-facts.yml"), "utf8");
    expect(workflow).toContain('cron: "0 7 * * 1"');
    expect(workflow).toContain("secrets.NEXT_PUBLIC_SUPABASE_URL");
    expect(workflow).toContain("secrets.SUPABASE_SECRET_KEY");
    expect(workflow).toContain("secrets.SUPABASE_URL");
    expect(workflow).toContain("secrets.SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).toContain("scripts/company-facts.mjs");
  });
});

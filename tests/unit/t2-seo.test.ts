import { describe, expect, it } from "vitest";

import snapshotRaw from "@/data/company-facts.snapshot.json";
import { GUIDES, guideBySlug, visibleGuides } from "@/lib/content/guias";
import {
  CATEGORIES,
  COMPARE_PAIRS,
  MIN_CATEGORY_SIZE,
  assetsInCategory,
  comparePath,
  sectorFor,
  similarAssets,
} from "@/lib/seo/categories";
import {
  COMPANY_SNAPSHOT_DATE,
  companyProfile,
  formatFiscalYearEnd,
  formatUsdCompact,
  type CompanyProfile,
} from "@/lib/seo/company-profile";
import type { PublicAsset } from "@/lib/seo/public-catalog";
import { stockFacts, stockFaq, stockIntro } from "@/lib/seo/stock-copy";

/** Fecha real del último cambio de la tanda (ver HERMES_ENCARGO_T2 §0). */
const UPDATED_AT = "2026-11-10";

/** Snapshot SEC ya versionado en el repo (mismo archivo que lee la capa de datos). */
const SNAPSHOT_ROWS =
  (snapshotRaw as unknown as { rows?: Record<string, unknown> }).rows ?? {};

/** Activo público mínimo, con la forma exacta de `PublicAsset`. */
function publicAsset(partial: Partial<PublicAsset> & { ticker: string }): PublicAsset {
  const ticker = partial.ticker.toUpperCase();
  return {
    slug: partial.slug ?? ticker.toLowerCase(),
    name: partial.name ?? ticker,
    ticker,
    symbol: partial.symbol ?? `${ticker}x`,
    etf: partial.etf ?? false,
    updatedAt: partial.updatedAt ?? UPDATED_AT,
  };
}

/** Perfil sin cifras: sirve para comprobar que no se inventan ceros. */
function blankProfile(partial: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    ticker: "AAPL",
    kind: "company",
    name: "Apple Inc.",
    cik: "0000320193",
    sic: "3571",
    sicDescription: "Electronic Computers",
    exchange: null,
    fiscalYearEnd: null,
    sharesOutstanding: null,
    sharesAsOf: null,
    epsTtm: null,
    epsPeriodEnd: null,
    revenueTtm: null,
    netIncomeTtm: null,
    dividendsPerShareTtm: null,
    last10k: null,
    last10q: null,
    lastFilingForm: null,
    sourceUrl: null,
    reportCurrency: null,
    fundFamily: null,
    fundNetAssets: null,
    fundReportDate: null,
    fundHoldingsCount: null,
    fundTopHoldings: null,
    ...partial,
  };
}

/**
 * Primeros `limit` tickers del snapshot que sí tienen perfil con nombre.
 * Se deduplica por nombre para que dos clases de acción no cuenten doble.
 */
function realAssets(limit: number): { asset: PublicAsset; profile: CompanyProfile }[] {
  const seen = new Set<string>();
  const out: { asset: PublicAsset; profile: CompanyProfile }[] = [];
  for (const ticker of Object.keys(SNAPSHOT_ROWS)) {
    const profile = companyProfile(ticker);
    if (!profile?.name) continue;
    const key = profile.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      asset: publicAsset({
        ticker: profile.ticker,
        name: profile.name,
        symbol: `${profile.ticker.replace(/[^A-Za-z0-9]/g, "")}x`,
        etf: profile.kind === "fund",
      }),
      profile,
    });
    if (out.length >= limit) break;
  }
  return out;
}

const apple = publicAsset({ ticker: "AAPL", name: "Apple Inc.", slug: "apple" });
const microsoft = publicAsset({ ticker: "MSFT", name: "Microsoft Corporation", slug: "microsoft" });
const nvidia = publicAsset({ ticker: "NVDA", name: "NVIDIA Corporation" });
const alphabet = publicAsset({ ticker: "GOOGL", name: "Alphabet Inc." });
const jpmorgan = publicAsset({ ticker: "JPM", name: "JPMorgan Chase & Co." });
const spy = publicAsset({ ticker: "SPY", name: "SPDR S&P 500 ETF Trust", etf: true });

describe("perfil de empresa desde el snapshot SEC", () => {
  it("trae cifras reales de Apple y la fuente EDGAR", () => {
    const aapl = companyProfile("AAPL");
    expect(aapl).not.toBeNull();
    expect(aapl?.ticker).toBe("AAPL");
    expect(aapl?.kind).toBe("company");
    expect(aapl?.revenueTtm ?? 0).toBeGreaterThan(0);
    expect(aapl?.netIncomeTtm ?? 0).toBeGreaterThan(0);
    expect(aapl?.cik).toMatch(/^\d{10}$/);
    // El enlace de la fuente, cuando viene, es de EDGAR.
    if (aapl?.sourceUrl) expect(aapl.sourceUrl).toContain("sec.gov");
  });

  it("normaliza minúsculas y el punto de las clases de acción", () => {
    const dotted = companyProfile("brk.b");
    expect(dotted).not.toBeNull();
    expect(dotted?.ticker).toBe("BRK-B");
    expect(companyProfile("brk-b")?.cik).toBe(dotted?.cik);
    expect(companyProfile("aapl")?.ticker).toBe("AAPL");
  });

  it("un ticker fuera del universo devuelve null", () => {
    expect(companyProfile("ZZZZ-NO-EXISTE")).toBeNull();
    expect(companyProfile("")).toBeNull();
  });

  it("publica la fecha real del snapshot", () => {
    expect(COMPANY_SNAPSHOT_DATE).toBe("2026-11-10");
  });
});

describe("formatos es-CL de las cifras", () => {
  it("sin dato no hay texto", () => {
    expect(formatUsdCompact(null)).toBeNull();
  });

  it("usa millones, mil millones y billones como en Chile", () => {
    const big = formatUsdCompact(478_834_000_000) ?? "";
    expect(big).toContain("US$");
    expect(big).toContain("mil millones");

    const millions = formatUsdCompact(850_000_000) ?? "";
    expect(millions).toContain("millones");
    expect(millions).not.toContain("mil millones");

    const trillions = formatUsdCompact(1_200_000_000_000) ?? "";
    expect(trillions).toContain("billones");
  });

  it("mantiene el signo en las pérdidas", () => {
    const negative = formatUsdCompact(-2_500_000_000) ?? "";
    expect(negative).toMatch(/[-−]/);
    expect(negative).toContain("mil millones");
  });

  it("traduce el cierre fiscal MM/DD a español", () => {
    expect(formatFiscalYearEnd("0926")).toBe("26 de septiembre");
    expect(formatFiscalYearEnd(null)).toBeNull();
  });
});

describe("texto único por ficha", () => {
  it("30 perfiles reales dan primeras frases distintas y sin promesas", () => {
    const sample = realAssets(30);
    expect(sample.length).toBeGreaterThanOrEqual(30);

    const intros = sample.map(({ asset, profile }) => stockIntro(asset, profile));
    for (const paragraphs of intros) {
      expect(paragraphs.length).toBeGreaterThanOrEqual(2);
      expect(paragraphs.every((paragraph) => paragraph.trim().length > 10)).toBe(true);
    }

    const firsts = intros.map((paragraphs) => paragraphs[0]);
    expect(new Set(firsts).size).toBe(firsts.length);

    const joined = intros.flat().join(" ").toLowerCase();
    expect(joined).not.toContain("rentabilidad");
    expect(joined).not.toContain("deberías");
    expect(joined).not.toContain("garantiza");
  });

  it("sin perfil escribe un texto honesto y sin cifras", () => {
    const paragraphs = stockIntro(apple, null);
    expect(paragraphs.length).toBeGreaterThan(0);
    const text = paragraphs.join(" ").toLowerCase();
    expect(text).not.toContain("us$");
    expect(text).not.toContain("rentabilidad");
    expect(text).not.toContain("garantiza");
  });

  it("stockFacts no inventa ceros para los datos nulos", () => {
    const withNulls = stockFacts(apple, blankProfile());
    const nullValues = withNulls.map((fact) => fact.value.trim());
    expect(nullValues.every((value) => value.length > 0)).toBe(true);
    expect(nullValues.some((value) => /^(US\$)?0(,0+)?$/.test(value))).toBe(false);

    const profile = companyProfile("AAPL");
    expect(profile).not.toBeNull();
    const real = stockFacts(apple, profile as CompanyProfile);
    expect(real.length).toBeGreaterThan(withNulls.length);
    expect(real.some((fact) => /ingresos/i.test(fact.label))).toBe(true);
    const realValues = real.map((fact) => fact.value.trim());
    expect(realValues.every((value) => value.length > 0)).toBe(true);
    expect(realValues.some((value) => /^(US\$)?0(,0+)?$/.test(value))).toBe(false);
  });

  it("stockFaq arma entre 4 y 6 preguntas con respuesta", () => {
    const faq = stockFaq(apple, companyProfile("AAPL"));
    expect(faq.length).toBeGreaterThanOrEqual(4);
    expect(faq.length).toBeLessThanOrEqual(6);
    for (const entry of faq) {
      expect(entry.question.trim().length).toBeGreaterThan(0);
      expect(entry.answer.trim().length).toBeGreaterThan(0);
      expect(entry.question).toContain("?");
    }
  });
});

describe("categorías del catálogo", () => {
  it("existen las listas editoriales y dividendos", () => {
    const slugs = CATEGORIES.map((category) => category.slug);
    expect(slugs).toContain("inteligencia-artificial");
    expect(slugs).toContain("dividendos");

    const editorial = CATEGORIES.find((category) => category.slug === "inteligencia-artificial");
    expect(editorial?.editorial).toBe(true);
    const editorialText = `${editorial?.description ?? ""} ${editorial?.intro ?? ""}`.toLowerCase();
    expect(editorialText).toContain("selección editorial");

    const dividends = CATEGORIES.find((category) => category.slug === "dividendos");
    expect(dividends?.editorial).toBe(false);
    expect(MIN_CATEGORY_SIZE).toBe(3);
  });

  it("sectorFor usa el SIC de la empresa y marca los ETF", () => {
    expect(sectorFor(apple)?.slug).toBe("tecnologia");
    expect(sectorFor(spy)?.slug).toBe("etf");
  });

  it("assetsInCategory respeta la lista editorial", () => {
    const members = assetsInCategory("inteligencia-artificial", [
      nvidia,
      microsoft,
      alphabet,
      apple,
    ]);
    expect(members.map((asset) => asset.ticker).sort()).toEqual(["GOOGL", "MSFT", "NVDA"]);
  });

  it("similarAssets excluye el propio activo, filtra por sector y acota", () => {
    const similar = similarAssets(apple, [apple, microsoft, nvidia, jpmorgan, spy]);
    const tickers = similar.map((asset) => asset.ticker);
    expect(tickers).not.toContain("AAPL");
    expect(tickers).toContain("MSFT");
    expect(tickers).not.toContain("JPM");
    expect(similarAssets(apple, [apple, microsoft, nvidia, alphabet], 1)).toHaveLength(1);
  });

  it("comparePath y COMPARE_PAIRS siguen la ruta fija", () => {
    expect(comparePath(apple, microsoft)).toBe("/comparar/apple-vs-microsoft");
    expect(COMPARE_PAIRS.some(([a, b]) => a === "AAPL" && b === "MSFT")).toBe(true);
  });
});

describe("guías", () => {
  it("hay 6 guías y 4 visibles sin la variable de borradores", () => {
    const previous = process.env.MAVERLANG_SHOW_DRAFT_GUIDES;
    delete process.env.MAVERLANG_SHOW_DRAFT_GUIDES;
    try {
      expect(GUIDES).toHaveLength(6);
      const visible = visibleGuides();
      expect(visible).toHaveLength(4);
      expect(visible.every((guide) => guide.legalReview === false)).toBe(true);
      const slugs = visible.map((guide) => guide.slug);
      expect(slugs).toContain("que-es-una-accion-tokenizada");
      expect(slugs).not.toContain("impuestos-sii-acciones-tokenizadas");
      expect(slugs).not.toContain("riesgos-y-derechos-que-no-tienes");
      expect(guideBySlug("impuestos-sii-acciones-tokenizadas")).toBeNull();
      expect(guideBySlug("que-es-una-accion-tokenizada")).not.toBeNull();
    } finally {
      if (previous === undefined) delete process.env.MAVERLANG_SHOW_DRAFT_GUIDES;
      else process.env.MAVERLANG_SHOW_DRAFT_GUIDES = previous;
    }
  });

  it("ningún texto deja marcas de revisión legal", () => {
    for (const guide of GUIDES) {
      const text = JSON.stringify(guide);
      expect(text).not.toContain("[REVISIÓN");
      expect(text).not.toContain("[VERIFICAR");
      expect(text.toLowerCase()).not.toContain("revisión abogado");
    }
  });

  it("títulos ≤ 60 y descripciones de 120 a 155 caracteres", () => {
    for (const guide of GUIDES) {
      expect(guide.title.length).toBeLessThanOrEqual(60);
      expect(guide.description.length).toBeGreaterThanOrEqual(120);
      expect(guide.description.length).toBeLessThanOrEqual(155);
    }
    const descriptions = GUIDES.map((guide) => guide.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("cada guía trae secciones y fecha real", () => {
    for (const guide of GUIDES) {
      expect(guide.updatedAt).toBe(UPDATED_AT);
      expect(guide.readingMinutes).toBeGreaterThan(0);
      expect(guide.h1.trim().length).toBeGreaterThan(0);
      expect(guide.sections.length).toBeGreaterThanOrEqual(4);
      expect(guide.sections.length).toBeLessThanOrEqual(7);
      for (const section of guide.sections) {
        expect(section.heading.trim().length).toBeGreaterThan(0);
        expect(section.paragraphs.length).toBeGreaterThan(0);
      }
    }
  });
});

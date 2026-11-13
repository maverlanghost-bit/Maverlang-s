/**
 * Texto único por ficha pública de acción (`/acciones/[slug]`).
 *
 * Todo sale de dos fuentes que ya están en el repo: el catálogo público
 * (`PublicAsset`) y el perfil de la SEC (`CompanyProfile`, snapshot de EDGAR).
 * No hay cifras escritas a mano: si un dato es `null`, la frase no se arma y el
 * dato no se muestra (nunca se rellena con 0). Sin recomendaciones, sin
 * proyecciones y sin prometer ganancias.
 *
 * La estructura cambia con un hash determinista del ticker: la misma ficha
 * siempre se lee igual, pero las 446 fichas no se leen iguales entre sí.
 */
import { aboutForTicker } from "@/content/tickers";
import { sectorFor } from "@/lib/seo/categories";
import {
  COMPANY_SNAPSHOT_DATE,
  formatFiscalYearEnd,
  formatUsdCompact,
  type CompanyProfile,
} from "@/lib/seo/company-profile";
import type { PublicAsset } from "@/lib/seo/public-catalog";

export type StockFact = { label: string; value: string };
export type StockFaqItem = { question: string; answer: string };

/** Fecha larga en es-CL. Se formatea en UTC para que el día no se corra. */
const LONG_DATE = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const INTEGER = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const PER_SHARE = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const PERCENT = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

/** Cuatro órdenes de frases para que las cifras no se lean siempre igual. */
const FIGURE_ORDERS: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [1, 0, 2],
  [2, 0, 1],
  [0, 2, 1],
];

/** FNV-1a de 32 bits: determinista y barato. */
function hashOf(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** `YYYY-MM-DD` (o ISO completo) → sólo el día; null si no se puede leer. */
function isoDay(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match?.[1] ?? null;
}

/** `"2026-11-03"` → `"3 de noviembre de 2026"`. */
function longDate(value: string | null): string | null {
  const day = isoDay(value);
  if (!day) return null;
  const time = Date.parse(`${day}T12:00:00Z`);
  if (Number.isNaN(time)) return null;
  return LONG_DATE.format(time);
}

/** `8.98` → `"US$8,98"`; negativo con el signo delante (`-US$0,45`). */
function usdPerShare(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const sign = value < 0 ? "-" : "";
  return `${sign}US$${PER_SHARE.format(Math.abs(value))}`;
}

/** `7.02` → `"7,02 %"`. */
function percentLabel(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `${PERCENT.format(value)} %`;
}

/** Nombre del sector en español, tal como lo deriva `sectorFor`. */
function sectorName(asset: PublicAsset): string | null {
  const sector = sectorFor(asset);
  if (!sector) return null;
  const name = sector.name.trim();
  return name ? name : null;
}

/** "a, b y c". */
function joinClauses(clauses: readonly string[]): string {
  if (clauses.length === 0) return "";
  if (clauses.length === 1) return clauses[0] ?? "";
  const last = clauses[clauses.length - 1] ?? "";
  return `${clauses.slice(0, -1).join(", ")} y ${last}`;
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/** Frase del token: sigue el precio, pero no da derechos de accionista. */
function tokenSentence(asset: PublicAsset, fund: boolean): string {
  if (fund) {
    return `El token ${asset.symbol} se mueve en Solana y sigue el precio del ETF, pero no te da participación en el fondo ni derecho a voto.`;
  }
  return `El token ${asset.symbol} se mueve en Solana y sigue el precio de la acción, pero no te convierte en accionista ni da derecho a voto.`;
}

function withAbout(about: string | null, text: string): string {
  return about ? `${about} ${text}` : text;
}

/** Apertura para una empresa con perfil de la SEC. */
function companyOpening(
  asset: PublicAsset,
  profile: CompanyProfile,
  sector: string | null,
  variant: number,
): string {
  const name = `${asset.name} (${asset.ticker})`;
  const noun = asset.etf ? "un ETF" : "una empresa";
  const sectorClause = sector && !asset.etf ? ` del sector ${sector}` : "";
  const exchange = profile.exchange?.trim();
  const exchangeClause = exchange ? ` que cotiza en ${exchange}` : "";
  const instrument = asset.etf ? "el ETF" : "la acción";
  const issuer = asset.etf ? "el fondo" : "la empresa";

  switch (variant) {
    case 0:
      return `${name} es ${noun}${sectorClause}${exchangeClause}. El token ${asset.symbol} se mueve en Solana y sigue el precio de ${instrument}.`;
    case 1:
      return `Esta ficha reúne lo que la SEC informa sobre ${name}, ${noun}${sectorClause}${exchangeClause}, y el token ${asset.symbol} con que se opera en Solana.`;
    case 2:
      return `${asset.symbol} sigue el precio de ${name}, ${noun}${sectorClause}${exchangeClause}. Las cifras de esta ficha vienen de los informes de ${issuer} a la SEC.`;
    default:
      return `La ficha de ${name}, ${noun}${sectorClause}${exchangeClause}, reúne los datos que ${issuer} presenta a la SEC y el detalle del token ${asset.symbol}, que sigue el precio de ${instrument} en Solana.`;
  }
}

/** Apertura para un fondo cotizado (N-PORT). */
function fundOpening(asset: PublicAsset, variant: number): string {
  const name = `${asset.name} (${asset.ticker})`;
  switch (variant) {
    case 0:
      return `${name} es un fondo cotizado (ETF) y en esta ficha se opera como ${asset.symbol}, un token en Solana que sigue su precio.`;
    case 1:
      return `Esta ficha reúne lo que la SEC informa sobre ${name}, un ETF que se opera como ${asset.symbol}, un token en Solana.`;
    case 2:
      return `${asset.symbol} sigue el precio de ${name}, un ETF listado en EE.UU., y se mueve como un token en Solana.`;
    default:
      return `La ficha de ${name}, un ETF listado en EE.UU., reúne los datos del fondo que publica la SEC y el detalle de ${asset.symbol}, el token que sigue su precio.`;
  }
}

/** Apertura honesta cuando no hay perfil: sin cifras ni fuentes inventadas. */
function orphanOpening(asset: PublicAsset): string {
  const instrument = asset.etf ? "el ETF" : "la acción";
  return `${asset.name} (${asset.ticker}) se opera como ${asset.symbol}, un token en Solana que sigue el precio de ${instrument}.`;
}

/** Frase de ingresos y utilidad, con la nota de moneda si hubo conversión. */
function financialSentence(asset: PublicAsset, profile: CompanyProfile): string | null {
  const revenue = formatUsdCompact(profile.revenueTtm);
  const income = formatUsdCompact(profile.netIncomeTtm);
  const loss = profile.netIncomeTtm !== null && profile.netIncomeTtm < 0;
  const currency = profile.reportCurrency?.trim();
  const currencyNote = currency && currency !== "USD" ? ` (cifras convertidas a dólares desde ${currency})` : "";

  if (revenue && income) {
    const incomePart =
      loss && profile.netIncomeTtm !== null
        ? `una pérdida neta de ${formatUsdCompact(Math.abs(profile.netIncomeTtm))}`
        : `una utilidad neta de ${income}`;
    return `En los últimos doce meses informados a la SEC, ${asset.name} registró ingresos por ${revenue} y ${incomePart}${currencyNote}.`;
  }
  if (revenue) {
    return `En los últimos doce meses informados a la SEC, ${asset.name} registró ingresos por ${revenue}${currencyNote}.`;
  }
  if (income) {
    const result = loss ? "una pérdida neta" : "una utilidad neta";
    return `En los últimos doce meses informados a la SEC, ${asset.name} registró ${result} de ${income}${currencyNote}.`;
  }
  return null;
}

/** Cifras de una empresa, en uno de los cuatro órdenes del hash. */
function companyFigures(asset: PublicAsset, profile: CompanyProfile, variant: number): string | null {
  const eps = usdPerShare(profile.epsTtm);
  const dividends =
    profile.dividendsPerShareTtm !== null && profile.dividendsPerShareTtm > 0
      ? usdPerShare(profile.dividendsPerShareTtm)
      : null;
  const parts: (string | null)[] = [
    financialSentence(asset, profile),
    eps ? `La utilidad por acción de los últimos doce meses fue de ${eps}.` : null,
    dividends ? `Los dividendos por acción de los últimos doce meses suman ${dividends}.` : null,
  ];
  const order = FIGURE_ORDERS[variant % FIGURE_ORDERS.length];
  const sentences = order
    .map((index) => parts[index])
    .filter((sentence): sentence is string => typeof sentence === "string" && sentence.length > 0);
  return sentences.length > 0 ? sentences.join(" ") : null;
}

/** "20-F" / "40-F" del emisor extranjero; "10-K" para una empresa de EE.UU. */
function annualForm(profile: CompanyProfile): string {
  if (profile.kind !== "foreign") return "10-K";
  const form = profile.lastFilingForm?.trim() ?? "";
  return /^(20|40)-F$/.test(form) ? form : "20-F";
}

/** Cierre de una empresa: año fiscal, último 10-K/10-Q y frase del token. */
function companyClosing(asset: PublicAsset, profile: CompanyProfile, variant: number): string {
  const token = tokenSentence(asset, asset.etf);
  const fiscal = formatFiscalYearEnd(profile.fiscalYearEnd);
  const annual = longDate(profile.last10k);
  const quarterly = longDate(profile.last10q);
  const form = annualForm(profile);

  let reports: string | null = null;
  if (annual && quarterly && profile.kind === "company") {
    reports = `Su último informe anual ante la SEC (10-K) es del ${annual} y el último trimestral (10-Q) del ${quarterly}`;
  } else if (annual) {
    reports = `Su último informe anual ante la SEC (${form}) es del ${annual}`;
  } else if (quarterly && profile.kind === "company") {
    reports = `Su último informe trimestral ante la SEC (10-Q) es del ${quarterly}`;
  }
  if (fiscal && reports) {
    reports = `Su año fiscal cierra el ${fiscal} y ${lowerFirst(reports)}`;
  } else if (fiscal) {
    reports = `Su año fiscal cierra el ${fiscal}`;
  }

  const period = reports ? `${reports}.` : "";
  return variant % 2 === 0 ? `${period} ${token}`.trim() : `${token} ${period}`.trim();
}

/** "Sus tres mayores posiciones son A (7,02 %), B (4,5 %) y C (3,1 %)." */
function topHoldingsSentence(rows: CompanyProfile["fundTopHoldings"]): string | null {
  if (!rows || rows.length === 0) return null;
  const top = rows.slice(0, 3).map((row) => {
    const pct = percentLabel(row.pct);
    return pct ? `${row.name} (${pct})` : row.name;
  });
  if (top.length === 0) return null;
  const lead = top.length === 3 ? "Sus tres mayores posiciones son" : "Sus principales posiciones son";
  return `${lead} ${joinClauses(top)}.`;
}

/** Cifras de un fondo: familia, activos netos, posiciones y mayores tenencias. */
function fundFigures(profile: CompanyProfile): string | null {
  const family = profile.fundFamily?.trim() ?? "";
  const netAssets = formatUsdCompact(profile.fundNetAssets);
  const reportDate = longDate(profile.fundReportDate);
  const holdings = profile.fundHoldingsCount;
  const top = topHoldingsSentence(profile.fundTopHoldings);

  const parts: string[] = [];
  if (family) parts.push(`Pertenece a la familia ${family}.`);

  const clauses: string[] = [];
  if (netAssets) clauses.push(`administra activos netos por ${netAssets}`);
  if (holdings !== null) clauses.push(`tiene ${INTEGER.format(holdings)} posiciones`);
  if (clauses.length > 0) {
    const when = reportDate ? ` al ${reportDate}` : "";
    parts.push(`Según su último informe a la SEC (N-PORT)${when}, el fondo ${joinClauses(clauses)}.`);
  } else if (reportDate) {
    parts.push(`Su último informe a la SEC (N-PORT) es del ${reportDate}.`);
  }

  if (top) parts.push(top);
  return parts.length > 0 ? parts.join(" ") : null;
}

/** Cierre de un fondo: último N-PORT y frase del token. */
function fundClosing(asset: PublicAsset, profile: CompanyProfile, variant: number): string {
  const token = tokenSentence(asset, true);
  const date = longDate(profile.last10q);
  const report = date ? `El último informe del fondo ante la SEC (N-PORT) es del ${date}.` : "";
  return variant % 2 === 0 ? `${report} ${token}`.trim() : `${token} ${report}`.trim();
}

/**
 * Dos o tres párrafos únicos para la ficha: identidad y sector, cifras de la
 * SEC (o del N-PORT en fondos) y qué es el token. Sin perfil, texto honesto.
 */
export function stockIntro(asset: PublicAsset, profile: CompanyProfile | null): string[] {
  const aboutRow = aboutForTicker(asset.symbol);
  const about = aboutRow ? aboutRow.es.trim() || null : null;
  const hash = hashOf(asset.ticker || asset.symbol);
  const openingVariant = hash % 4;
  const orderVariant = Math.floor(hash / 4) % 4;

  if (!profile) {
    const issuer = asset.etf ? "del fondo" : "de la empresa";
    return [
      withAbout(about, orphanOpening(asset)),
      `Todavía no tenemos los datos ${issuer} para esta ficha. Cuando estén disponibles, se mostrarán con su fuente y su fecha. ${tokenSentence(asset, asset.etf)}`,
    ];
  }

  if (profile.kind === "fund") {
    const paragraphs = [withAbout(about, fundOpening(asset, openingVariant))];
    const figures = fundFigures(profile);
    if (figures) paragraphs.push(figures);
    paragraphs.push(fundClosing(asset, profile, orderVariant));
    return paragraphs;
  }

  const paragraphs = [withAbout(about, companyOpening(asset, profile, sectorName(asset), openingVariant))];
  const figures = companyFigures(asset, profile, orderVariant);
  if (figures) paragraphs.push(figures);
  paragraphs.push(companyClosing(asset, profile, orderVariant));
  return paragraphs;
}

/**
 * Datos de la empresa para la ficha. Sólo entran los valores no nulos: una
 * cifra ausente no se muestra como 0. Sin perfil no hay sección de datos.
 */
export function stockFacts(asset: PublicAsset, profile: CompanyProfile | null): StockFact[] {
  if (!profile) return [];

  const facts: StockFact[] = [];
  const sector = sectorName(asset);
  if (sector) facts.push({ label: "Sector", value: sector });

  const exchange = profile.exchange?.trim();
  if (exchange) facts.push({ label: "Bolsa", value: exchange });

  const fiscal = formatFiscalYearEnd(profile.fiscalYearEnd);
  if (fiscal) facts.push({ label: "Cierre del año fiscal", value: fiscal });

  if (profile.kind === "fund") {
    const netAssets = formatUsdCompact(profile.fundNetAssets);
    const reportDate = longDate(profile.fundReportDate);
    if (netAssets) {
      facts.push({
        label: "Activos netos del fondo",
        value: reportDate ? `${netAssets} (al ${reportDate})` : netAssets,
      });
    }
    if (profile.fundHoldingsCount !== null) {
      facts.push({ label: "Posiciones del fondo", value: INTEGER.format(profile.fundHoldingsCount) });
    }
    const nport = longDate(profile.last10q);
    if (nport) facts.push({ label: "Último informe del fondo (N-PORT)", value: nport });
    return facts;
  }

  const revenue = formatUsdCompact(profile.revenueTtm);
  if (revenue) facts.push({ label: "Ingresos (últimos 12 meses)", value: revenue });

  const income = formatUsdCompact(profile.netIncomeTtm);
  if (income) facts.push({ label: "Utilidad neta (últimos 12 meses)", value: income });

  const eps = usdPerShare(profile.epsTtm);
  if (eps) facts.push({ label: "Utilidad por acción (12 meses)", value: eps });

  const dividends = usdPerShare(profile.dividendsPerShareTtm);
  if (dividends) facts.push({ label: "Dividendos por acción (12 meses)", value: dividends });

  if (profile.sharesOutstanding !== null) {
    const asOf = longDate(profile.sharesAsOf);
    const shares = INTEGER.format(profile.sharesOutstanding);
    facts.push({
      label: "Acciones en circulación",
      value: asOf ? `${shares} (al ${asOf})` : shares,
    });
  }

  const annual = longDate(profile.last10k);
  if (annual) facts.push({ label: annualLabel(profile), value: annual });

  const quarterly = longDate(profile.last10q);
  if (quarterly && profile.kind === "company") {
    facts.push({ label: "Último informe trimestral (10-Q)", value: quarterly });
  }

  const currency = profile.reportCurrency?.trim();
  if (currency && currency !== "USD") facts.push({ label: "Moneda del informe", value: currency });

  return facts;
}

/** Etiqueta del informe anual: 10-K para empresas de EE.UU., 20-F/40-F para extranjeras. */
function annualLabel(profile: CompanyProfile): string {
  return `Último informe anual (${annualForm(profile)})`;
}

/** Qué es el token, sin afirmar nada sobre dividendos del token. */
function whatIsAnswer(asset: PublicAsset, fund: boolean): string {
  const underlying = fund
    ? `el ETF ${asset.name} (${asset.ticker})`
    : `${asset.name} (${asset.ticker})`;
  return `${asset.symbol} es un token en la red Solana que se emite 1:1 contra ${underlying} y sigue su precio. Puedes comprar y vender fracciones desde US$10, con órdenes en dólares (US$).`;
}

/** Derechos que no entrega el token. */
function ownershipAnswer(asset: PublicAsset, fund: boolean): string {
  if (fund) {
    return `No. Comprar ${asset.symbol} no te da participación en el fondo ${asset.name} ni derecho a voto. Lo que tienes es un token cuyo precio sigue al del ETF subyacente.`;
  }
  return `No. Comprar ${asset.symbol} no te convierte en accionista de ${asset.name}: no tienes derecho a voto ni los derechos económicos de la acción. Lo que tienes es un token cuyo precio sigue al del subyacente.`;
}

/** Horario de operación y liquidez, con los datos de la ficha. */
function hoursAnswer(asset: PublicAsset): string {
  return `En la plataforma la operación es 24/7: puedes comprar y vender ${asset.symbol} en cualquier momento. El subyacente se transa en la bolsa de EE.UU. de 9:30 a 16:00 de Nueva York, de lunes a viernes; fuera de ese horario hay menos liquidez y el precio del token puede alejarse más del de ${asset.name}.`;
}

/** Fuente y fecha de las cifras, sin mezclar el precio del token con la SEC. */
function sourceAnswer(asset: PublicAsset, profile: CompanyProfile | null): string {
  const date = longDate(COMPANY_SNAPSHOT_DATE);
  const datePart = date ? ` Las cifras de esta ficha están al ${date}.` : "";
  if (!profile) {
    return `Todavía no tenemos datos de la SEC para esta empresa en esta ficha. El precio del token no viene de la SEC: lo entrega el mercado.`;
  }
  const fundNote = profile.kind === "fund" ? ", como el N-PORT de fondos" : "";
  return `De los informes que ${asset.name} presenta a la SEC (EDGAR)${fundNote}.${datePart} El precio del token no viene de la SEC: lo entrega el mercado.`;
}

/**
 * Preguntas frecuentes de la ficha (5). No se afirma nada sobre dividendos
 * del token ni se entrega ningún tipo de recomendación.
 */
export function stockFaq(asset: PublicAsset, profile: CompanyProfile | null): StockFaqItem[] {
  const fund = asset.etf || profile?.kind === "fund";
  return [
    { question: `¿Qué es ${asset.symbol}?`, answer: whatIsAnswer(asset, fund) },
    {
      question: `¿Comprar ${asset.symbol} me hace accionista de ${asset.name}?`,
      answer: ownershipAnswer(asset, fund),
    },
    {
      question: "¿Cuánto es lo mínimo para invertir?",
      answer:
        "La orden mínima es de US$10 y puedes comprar fracciones del token: no necesitas una acción completa. Las órdenes van en dólares (US$).",
    },
    { question: `¿Cuándo se puede operar ${asset.symbol}?`, answer: hoursAnswer(asset) },
    {
      question: `¿De dónde salen los datos de ${asset.name}?`,
      answer: sourceAnswer(asset, profile),
    },
  ];
}

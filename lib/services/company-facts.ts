/**
 * Lectura pura de EDGAR (SEC): CIK, submissions y companyfacts.
 * Sin red y sin Supabase. El script `scripts/company-facts.mjs` lo importa
 * con `node --experimental-strip-types`, así que este archivo no importa
 * otros módulos (Node no resuelve el alias `@/`).
 *
 * Trimestre: duración de 70 a 115 días. El acumulado del año (mismo `fp`)
 * no entra en la suma. Si al año fiscal le falta un solo trimestre, ese
 * trimestre es el anual menos los otros tres ya informados. Si tampoco así
 * hay 4 trimestres seguidos, se usa el anual más reciente solo cuando no
 * hay un trimestre posterior. Si el año quedó atrás, el dato queda vacío.
 * Entre conceptos, gana la serie cuyo hecho llega más lejos.
 */

export const EDGAR_USER_AGENT = "Maverlang hola@maverlang.com";
/** Tope de la SEC: 10 req/s. Este trabajo usa 4. */
export const EDGAR_MAX_REQUESTS_PER_SECOND = 4;
export const EDGAR_MIN_INTERVAL_MS = 250;
export const EDGAR_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
/** Misma ventana que `SHARES_MAX_AGE_DAYS` en lib/market/fundamentals.ts. */
export const FRESH_SHARES_DAYS = 450;

const PERIODIC_FORMS = new Set(["10-K", "10-Q", "10-K/A", "10-Q/A"]);
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ACCESSION_RE = /^\d{10}-\d{2}-\d{6}$/;
const OLDER_FILE_RE = /^CIK\d{10}-submissions-\d{3}\.json$/;

export interface EdgarFact {
  start?: string;
  end: string;
  val: number;
  fp?: string;
  form: string;
  filed?: string;
  frame?: string;
}

export interface EdgarMetrics {
  sharesOutstanding: number | null;
  sharesAsOf: string | null;
  epsTtm: number | null;
  epsPeriodEnd: string | null;
  revenueTtm: number | null;
  netIncomeTtm: number | null;
  dividendsPerShareTtm: number | null;
}

export interface FilingRow {
  form: string;
  filingDate: string;
  accessionNumber: string;
  primaryDocument: string;
}

export interface CompanyProfile {
  name: string | null;
  sic: string | null;
  sicDescription: string | null;
  exchange: string | null;
  fiscalYearEnd: string | null;
}

export interface FilingSummary {
  last10k: string | null;
  last10q: string | null;
  lastFilingForm: "10-K" | "10-Q" | null;
  sourceUrl: string | null;
}

export interface CompanyFactRecord {
  underlying: string;
  cik: string;
  name: string | null;
  sic: string | null;
  sic_description: string | null;
  exchange: string | null;
  fiscal_year_end: string | null;
  shares_outstanding: number | null;
  shares_as_of: string | null;
  eps_ttm: number | null;
  eps_period_end: string | null;
  revenue_ttm: number | null;
  net_income_ttm: number | null;
  dividends_per_share_ttm: number | null;
  last_10k: string | null;
  last_10q: string | null;
  last_filing_form: string | null;
  source_url: string | null;
}

export interface TrailingFigure {
  value: number;
  periodEnd: string;
}

/** CIK de 10 dígitos. Vacío si no hay dígitos. */
export function padCik(cik: string | number): string {
  const digits = String(cik).replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(10, "0").slice(-10);
}

export function edgarSubmissionsUrl(cik: string | number): string {
  return `https://data.sec.gov/submissions/CIK${padCik(cik)}.json`;
}

export function edgarCompanyFactsUrl(cik: string | number): string {
  return `https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`;
}

/** Clave de catálogo y ticker de EDGAR: mayúsculas y `.` → `-` (`BRK.B` → `BRK-B`). */
export function edgarTicker(value: string): string {
  return value.trim().toUpperCase().replace(/\./g, "-");
}

/**
 * Subyacente para la clave de `underlying_prices`.
 * Si el ticker curado existe, manda (igual que el historial).
 * Si no, el subyacente del catálogo y después `company_ticker`
 * (igual que scripts/underlying-prices.mjs).
 */
export function preferredUnderlyingRaw(input: {
  tickerUnderlying?: string | null;
  assetUnderlying?: string | null;
  companyTicker?: string | null;
}): string {
  const ticker = input.tickerUnderlying?.trim() ?? "";
  if (ticker) return ticker;
  const asset = input.assetUnderlying?.trim() ?? "";
  if (asset) return asset;
  return input.companyTicker?.trim() ?? "";
}

/** Días entre dos fechas de calendario. Negativo si `end` es anterior. */
export function daysBetween(start: string, end: string): number | null {
  const from = utcDay(start);
  const to = utcDay(end);
  if (from === null || to === null) return null;
  return Math.round((to - from) / 86_400_000);
}

/** Mapa ticker normalizado → CIK de 10 dígitos. El primero gana. */
export function indexCompanyTickers(body: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!body || typeof body !== "object") return map;
  for (const row of Object.values(body as Record<string, unknown>)) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const ticker = typeof record.ticker === "string" ? edgarTicker(record.ticker) : "";
    const cik = padCik(typeof record.cik_str === "number" || typeof record.cik_str === "string" ? record.cik_str : "");
    if (!ticker || !cik || map.has(ticker)) continue;
    map.set(ticker, cik);
  }
  return map;
}

export function isQuarterFact(fact: EdgarFact): boolean {
  if (!fact.start || fact.frame?.endsWith("I")) return false;
  const days = daysBetween(fact.start, fact.end);
  return days !== null && days >= 70 && days <= 115;
}

export function isAnnualFact(fact: EdgarFact): boolean {
  if (!fact.start || fact.frame?.endsWith("I")) return false;
  const days = daysBetween(fact.start, fact.end);
  return days !== null && days >= 300 && days <= 380;
}

export interface TrailingOptions {
  perShare?: boolean;
  /** Un TTM negativo no se publica (dividendos). */
  rejectNegative?: boolean;
  /**
   * La utilidad puede tener un trimestre de signo distinto al año.
   * Ingresos, EPS y dividendos no: si el residuo cambia de signo, no se arma.
   */
  allowSignFlip?: boolean;
}

/**
 * Suma de los últimos 4 trimestres seguidos. Si el año fiscal no separa
 * un trimestre, ese trimestre es el anual menos los otros tres. Si no se
 * puede armar y hay un trimestre más nuevo que el año, queda vacío.
 * `perShare` redondea a 6 decimales.
 */
export function trailingTwelveMonths(
  facts: readonly EdgarFact[],
  options: TrailingOptions = {},
): TrailingFigure | null {
  const quarters = dedupeByEnd(facts.filter(isQuarterFact));
  const annuals = dedupeByEnd(facts.filter(isAnnualFact));
  const four = sumLastFourQuarters(quarters);
  const bridged = four ? null : bridgeMissingQuarter(quarters, annuals, options);
  const found = four ?? (bridged ? sumLastFourQuarters([...quarters, bridged]) : null) ?? annualIfCurrent(quarters, annuals);
  return found ? finishTrailing(found, options) : null;
}

/** `dei:EntityCommonStockSharesOutstanding`: la cifra positiva más reciente. */
export function latestSharesOutstanding(facts: readonly EdgarFact[]): { value: number; asOf: string } | null {
  const sorted = facts
    .filter((fact) => fact.val > 0)
    .sort((a, b) => {
      const byEnd = b.end.localeCompare(a.end);
      if (byEnd !== 0) return byEnd;
      return (b.filed ?? "").localeCompare(a.filed ?? "");
    });
  const fact = sorted[0];
  if (!fact) return null;
  return { value: fact.val, asOf: fact.end };
}

export function metricsFromCompanyFacts(body: unknown): EdgarMetrics {
  const shares = latestSharesOutstanding(factsFor(body, "dei", "EntityCommonStockSharesOutstanding", "shares"));
  const eps = freshestTrailing(body, [
    ["us-gaap", "EarningsPerShareDiluted", "USD/shares"],
    ["us-gaap", "EarningsPerShareBasic", "USD/shares"],
  ], { perShare: true });
  const revenue = freshestTrailing(body, [
    ["us-gaap", "Revenues", "USD"],
    ["us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax", "USD"],
  ]);
  const netIncome = freshestTrailing(body, [["us-gaap", "NetIncomeLoss", "USD"]], { allowSignFlip: true });
  const dividends = freshestTrailing(body, [
    ["us-gaap", "CommonStockDividendsPerShareDeclared", "USD/shares"],
    ["us-gaap", "CommonStockDividendsPerShareCashPaid", "USD/shares"],
  ], { perShare: true, rejectNegative: true });
  return {
    sharesOutstanding: shares?.value ?? null,
    sharesAsOf: shares?.asOf ?? null,
    epsTtm: eps?.value ?? null,
    epsPeriodEnd: eps?.periodEnd ?? null,
    revenueTtm: revenue?.value ?? null,
    netIncomeTtm: netIncome?.value ?? null,
    dividendsPerShareTtm: dividends?.value ?? null,
  };
}

export function hasUsableMetrics(metrics: EdgarMetrics, today: string): boolean {
  if (
    metrics.epsTtm !== null ||
    metrics.revenueTtm !== null ||
    metrics.netIncomeTtm !== null ||
    metrics.dividendsPerShareTtm !== null
  ) {
    return true;
  }
  if (metrics.sharesOutstanding === null || !metrics.sharesAsOf) return false;
  const gap = daysBetween(metrics.sharesAsOf, today);
  return gap !== null && Math.abs(gap) <= FRESH_SHARES_DAYS;
}

export function profileFromSubmissions(body: unknown): CompanyProfile {
  const record = isRecord(body) ? body : {};
  return {
    name: textOrNull(record.name),
    sic: sicOf(record.sic),
    sicDescription: textOrNull(record.sicDescription),
    exchange: exchangeOf(record.exchanges),
    fiscalYearEnd: fiscalYearEndOf(record.fiscalYearEnd),
  };
}

/** Filas de `filings.recent` o de un archivo antiguo (el mismo arreglo suelto). */
export function filingRowsFromEdgar(body: unknown): FilingRow[] {
  const arrays = filingArrays(body);
  if (!arrays) return [];
  const rows: FilingRow[] = [];
  const length = arrays.form.length;
  for (let index = 0; index < length; index += 1) {
    const form = arrays.form[index];
    const filingDate = arrays.filingDate[index];
    const accessionNumber = arrays.accessionNumber[index];
    const primaryDocument = arrays.primaryDocument[index];
    if (!form || !filingDate || !accessionNumber || !primaryDocument) continue;
    if (!DAY_RE.test(filingDate)) continue;
    rows.push({ form, filingDate, accessionNumber, primaryDocument });
  }
  return rows;
}

/** Nombres de archivos antiguos, como máximo los que cumplen el patrón de la SEC. */
export function olderSubmissionNames(body: unknown): string[] {
  if (!isRecord(body) || !isRecord(body.filings) || !Array.isArray(body.filings.files)) return [];
  const names: string[] = [];
  for (const entry of body.filings.files) {
    if (!isRecord(entry) || typeof entry.name !== "string") continue;
    if (!OLDER_FILE_RE.test(entry.name)) continue;
    names.push(entry.name);
  }
  return names;
}

export function olderSubmissionUrl(name: string): string | null {
  if (!OLDER_FILE_RE.test(name)) return null;
  return `https://data.sec.gov/submissions/${name}`;
}

export function filingDocumentUrl(cik: string | number, accession: string, primaryDocument: string): string | null {
  const padded = padCik(cik);
  if (!padded || !ACCESSION_RE.test(accession)) return null;
  if (!safeDocument(primaryDocument)) return null;
  const cikInt = String(Number(padded));
  if (!cikInt || cikInt === "0" || cikInt === "NaN") return null;
  const accn = accession.replaceAll("-", "");
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accn}/${primaryDocument}`;
}

export function describeFilings(rows: readonly FilingRow[], cik: string | number): FilingSummary {
  let last10k: FilingRow | null = null;
  let last10q: FilingRow | null = null;
  for (const row of rows) {
    const base = baseForm(row.form);
    if (base === "10-K" && (!last10k || row.filingDate > last10k.filingDate)) last10k = row;
    if (base === "10-Q" && (!last10q || row.filingDate > last10q.filingDate)) last10q = row;
  }
  const winner =
    last10k && last10q
      ? last10k.filingDate >= last10q.filingDate
        ? last10k
        : last10q
      : (last10k ?? last10q);
  const form = winner ? baseForm(winner.form) : null;
  return {
    last10k: last10k?.filingDate ?? null,
    last10q: last10q?.filingDate ?? null,
    lastFilingForm: form,
    sourceUrl: winner ? filingDocumentUrl(cik, winner.accessionNumber, winner.primaryDocument) : null,
  };
}

/** Fila para el upsert, o null si EDGAR no trae una cifra usable. */
export function buildCompanyFactRecord(input: {
  underlying: string;
  cik: string | number;
  metrics: EdgarMetrics;
  profile: CompanyProfile;
  filings: FilingSummary;
  today: string;
}): CompanyFactRecord | null {
  const underlying = input.underlying.trim();
  const cik = padCik(input.cik);
  if (!underlying || !cik) return null;
  if (!hasUsableMetrics(input.metrics, input.today)) return null;
  return {
    underlying,
    cik,
    name: input.profile.name,
    sic: input.profile.sic,
    sic_description: input.profile.sicDescription,
    exchange: input.profile.exchange,
    fiscal_year_end: input.profile.fiscalYearEnd,
    shares_outstanding: input.metrics.sharesOutstanding,
    shares_as_of: input.metrics.sharesAsOf,
    eps_ttm: input.metrics.epsTtm,
    eps_period_end: input.metrics.epsPeriodEnd,
    revenue_ttm: input.metrics.revenueTtm,
    net_income_ttm: input.metrics.netIncomeTtm,
    dividends_per_share_ttm: input.metrics.dividendsPerShareTtm,
    last_10k: input.filings.last10k,
    last_10q: input.filings.last10q,
    last_filing_form: input.filings.lastFilingForm,
    source_url: input.filings.sourceUrl,
  };
}

/**
 * Entre conceptos gana el que tiene el hecho (trimestre o año) más nuevo.
 * Si empatan en esa fecha, se respeta el orden pedido (diluido antes que
 * básico). Una serie vieja no tapa a una más nueva que no se pudo sumar.
 */
function freshestTrailing(
  body: unknown,
  concepts: readonly (readonly [string, string, string])[],
  options: TrailingOptions = {},
): TrailingFigure | null {
  const ranked = concepts.map(([taxonomy, concept, unit]) => {
    const facts = factsFor(body, taxonomy, concept, unit);
    return { found: trailingTwelveMonths(facts, options), newest: newestPeriodicEnd(facts) };
  });
  let horizon: string | null = null;
  for (const row of ranked) {
    if (row.newest && (!horizon || row.newest > horizon)) horizon = row.newest;
  }
  if (!horizon) return null;
  for (const row of ranked) {
    if (row.newest === horizon && row.found) return row.found;
  }
  return null;
}

function factsFor(body: unknown, taxonomy: string, concept: string, unit: string): EdgarFact[] {
  if (!isRecord(body) || !isRecord(body.facts)) return [];
  const group = body.facts[taxonomy];
  if (!isRecord(group)) return [];
  const node = group[concept];
  if (!isRecord(node) || !isRecord(node.units)) return [];
  const list = node.units[unit];
  if (!Array.isArray(list)) return [];
  const facts: EdgarFact[] = [];
  for (const entry of list) {
    const fact = asFact(entry);
    if (fact) facts.push(fact);
  }
  return facts;
}

function asFact(value: unknown): EdgarFact | null {
  if (!isRecord(value) || value.segments) return null;
  const end = typeof value.end === "string" ? value.end : "";
  if (!DAY_RE.test(end)) return null;
  const form = typeof value.form === "string" ? value.form : "";
  if (!PERIODIC_FORMS.has(form)) return null;
  const raw = typeof value.val === "number" ? value.val : typeof value.val === "string" ? Number(value.val) : NaN;
  if (!Number.isFinite(raw)) return null;
  const start = typeof value.start === "string" && DAY_RE.test(value.start) ? value.start : undefined;
  return {
    start,
    end,
    val: raw,
    fp: typeof value.fp === "string" ? value.fp : undefined,
    form,
    filed: typeof value.filed === "string" ? value.filed : undefined,
    frame: typeof value.frame === "string" ? value.frame : undefined,
  };
}

function sumLastFourQuarters(facts: readonly EdgarFact[]): TrailingFigure | null {
  const sorted = dedupeByEnd(facts.filter(isQuarterFact)).sort((a, b) => b.end.localeCompare(a.end));
  const chosen: EdgarFact[] = [];
  for (const fact of sorted) {
    if (chosen.length === 0) {
      chosen.push(fact);
      continue;
    }
    const prev = chosen[chosen.length - 1];
    if (!prev) continue;
    const gap = daysBetween(fact.end, prev.end);
    if (gap === null || gap < 60) continue;
    if (gap > 130) break;
    if (prev.start && fact.end > prev.start) continue;
    chosen.push(fact);
    if (chosen.length === 4) break;
  }
  const latest = chosen[0];
  if (chosen.length !== 4 || !latest) return null;
  return {
    value: chosen.reduce((sum, fact) => sum + fact.val, 0),
    periodEnd: latest.end,
  };
}

function latestAnnualFact(facts: readonly EdgarFact[]): EdgarFact | null {
  const sorted = [...facts].sort((a, b) => {
    const byEnd = b.end.localeCompare(a.end);
    if (byEnd !== 0) return byEnd;
    return (b.filed ?? "").localeCompare(a.filed ?? "");
  });
  return sorted[0] ?? null;
}

/** El anual solo si no hay un trimestre que cierre después. */
function annualIfCurrent(quarters: readonly EdgarFact[], annuals: readonly EdgarFact[]): TrailingFigure | null {
  const annual = latestAnnualFact(annuals);
  if (!annual) return null;
  const newest = newestEnd(quarters);
  if (newest && newest > annual.end) return null;
  return { value: annual.val, periodEnd: annual.end };
}

/**
 * Un trimestre que el 10-K no separa: año fiscal menos los otros tres
 * trimestres de ese año. Solo si el hueco es uno y dura un trimestre.
 */
function bridgeMissingQuarter(
  quarters: readonly EdgarFact[],
  annuals: readonly EdgarFact[],
  options: TrailingOptions,
): EdgarFact | null {
  const annual = latestAnnualFact(annuals);
  if (!annual?.start) return null;
  const yearStart = annual.start;
  const inside = quarters
    .filter((fact) => fact.start && fact.start >= yearStart && fact.end <= annual.end)
    .sort((a, b) => a.end.localeCompare(b.end));
  if (inside.length !== 3) return null;
  for (let index = 1; index < inside.length; index += 1) {
    const previous = inside[index - 1];
    const next = inside[index];
    if (!previous || !next?.start || next.start <= previous.end) return null;
  }
  const gaps = uncoveredGaps(yearStart, annual.end, inside);
  if (gaps.length !== 1) return null;
  const gap = gaps[0];
  if (!gap) return null;
  const duration = daysBetween(gap.start, gap.end);
  if (duration === null || duration < 70 || duration > 115) return null;
  const residual = annual.val - inside.reduce((sum, fact) => sum + fact.val, 0);
  if (!residualOk(annual.val, residual, options)) return null;
  if (quarters.some((fact) => fact.end === gap.end)) return null;
  return {
    start: gap.start,
    end: gap.end,
    val: residual,
    fp: "Q4",
    form: annual.form,
    filed: annual.filed,
  };
}

function residualOk(annual: number, residual: number, options: TrailingOptions): boolean {
  if (!Number.isFinite(residual)) return false;
  if (options.rejectNegative && residual < 0) return false;
  if (options.allowSignFlip) return true;
  const epsilon = 1e-6;
  if (annual >= 0 && residual < -epsilon) return false;
  if (annual < 0 && residual > epsilon) return false;
  return true;
}

function uncoveredGaps(
  start: string,
  end: string,
  quarters: readonly EdgarFact[],
): { start: string; end: string }[] {
  const gaps: { start: string; end: string }[] = [];
  let cursor = start;
  for (const fact of quarters) {
    if (!fact.start) return [];
    if (fact.start > cursor) {
      const gapEnd = shiftDay(fact.start, -1);
      if (!gapEnd || gapEnd < cursor) return [];
      gaps.push({ start: cursor, end: gapEnd });
    } else if (fact.start < cursor) {
      return [];
    }
    const next = shiftDay(fact.end, 1);
    if (!next) return [];
    cursor = next;
  }
  if (cursor <= end) gaps.push({ start: cursor, end });
  return gaps;
}

function finishTrailing(found: TrailingFigure, options: TrailingOptions): TrailingFigure | null {
  if (options.rejectNegative && found.value < 0) return null;
  const value = options.perShare ? Math.round(found.value * 1e6) / 1e6 : found.value;
  return { value, periodEnd: found.periodEnd };
}

function newestPeriodicEnd(facts: readonly EdgarFact[]): string | null {
  return newestEnd(facts.filter((fact) => isQuarterFact(fact) || isAnnualFact(fact)));
}

function newestEnd(facts: readonly EdgarFact[]): string | null {
  let newest: string | null = null;
  for (const fact of facts) {
    if (!newest || fact.end > newest) newest = fact.end;
  }
  return newest;
}

function shiftDay(iso: string, days: number): string | null {
  const time = utcDay(iso);
  if (time === null) return null;
  const next = new Date(time + days * 86_400_000);
  const year = next.getUTCFullYear();
  const month = String(next.getUTCMonth() + 1).padStart(2, "0");
  const day = String(next.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dedupeByEnd(facts: readonly EdgarFact[]): EdgarFact[] {
  const best = new Map<string, EdgarFact>();
  for (const fact of facts) {
    const current = best.get(fact.end);
    best.set(fact.end, current ? preferFact(current, fact) : fact);
  }
  return [...best.values()];
}

function preferFact(current: EdgarFact, next: EdgarFact): EdgarFact {
  const filed = (next.filed ?? "").localeCompare(current.filed ?? "");
  if (filed > 0) return next;
  if (filed < 0) return current;
  if (next.frame && !current.frame) return next;
  return current;
}

function filingArrays(body: unknown): {
  form: string[];
  filingDate: string[];
  accessionNumber: string[];
  primaryDocument: string[];
} | null {
  const source = filingSource(body);
  if (!source) return null;
  const form = stringArray(source.form);
  const filingDate = stringArray(source.filingDate);
  const accessionNumber = stringArray(source.accessionNumber);
  const primaryDocument = stringArray(source.primaryDocument);
  if (!form || !filingDate || !accessionNumber || !primaryDocument) return null;
  return { form, filingDate, accessionNumber, primaryDocument };
}

function filingSource(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body)) return null;
  if (isRecord(body.filings) && isRecord(body.filings.recent)) return body.filings.recent;
  if (Array.isArray(body.form)) return body;
  return null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((entry) => (typeof entry === "string" ? entry : ""));
}

function baseForm(form: string): "10-K" | "10-Q" | null {
  if (form === "10-K" || form === "10-K/A") return "10-K";
  if (form === "10-Q" || form === "10-Q/A") return "10-Q";
  return null;
}

function safeDocument(document: string): boolean {
  if (!document || document.includes("..") || document.includes("\\") || document.startsWith("/")) return false;
  return /^[A-Za-z0-9._/-]+$/.test(document);
}

function fiscalYearEndOf(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}$/.test(value)) return null;
  const month = Number(value.slice(0, 2));
  const day = Number(value.slice(2));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return value;
}

function exchangeOf(value: unknown): string | null {
  if (Array.isArray(value)) {
    const parts = value.map(textOrNull).filter((item): item is string => item !== null);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  return textOrNull(value);
}

function sicOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return textOrNull(value);
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function utcDay(iso: string): number | null {
  const match = DAY_RE.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return time;
}

/**
 * Cálculos de la ficha a partir de cifras ya guardadas.
 * Puro: sin red, sin Supabase y sin "server-only".
 * La capitalización usa el cierre de la acción (underlying_prices), no el precio del token.
 * Si falta un dato, el resultado es null: no se inventa un número.
 */

/** Recuento de acciones más viejo que esto no entra en la capitalización. */
export const SHARES_MAX_AGE_DAYS = 450;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type FactLocale = "es-CL" | "en";

export interface CompanyFactsView {
  symbol: string;
  underlying: string;
  name: string | null;
  sector: string | null;
  sic: string | null;
  exchange: string | null;
  fiscalYearEnd: string | null;
  sharesOutstanding: number | null;
  sharesAsOf: string | null;
  lastClose: number | null;
  lastCloseDate: string | null;
  marketCapUsd: number | null;
  pe: number | null;
  dividendYield: number | null;
  epsTtm: number | null;
  epsPeriodEnd: string | null;
  revenueTtm: number | null;
  netIncomeTtm: number | null;
  dividendsPerShareTtm: number | null;
  last10k: string | null;
  last10q: string | null;
  lastFilingForm: string | null;
  source: "sec-edgar";
  sourceUrl: string | null;
  updatedAt: string | null;
}

export interface CompanyFactsInput {
  symbol: string;
  underlying: string;
  name: string | null;
  sector: string | null;
  sic: string | null;
  exchange: string | null;
  fiscalYearEnd: string | null;
  sharesOutstanding: number | null;
  sharesAsOf: string | null;
  lastClose: number | null;
  lastCloseDate: string | null;
  epsTtm: number | null;
  epsPeriodEnd: string | null;
  revenueTtm: number | null;
  netIncomeTtm: number | null;
  dividendsPerShareTtm: number | null;
  last10k: string | null;
  last10q: string | null;
  lastFilingForm: string | null;
  sourceUrl: string | null;
  updatedAt: string | null;
}

/** Días de calendario entre dos `YYYY-MM-DD`. Negativo si `end` es anterior. */
export function calendarDaysBetween(start: string, end: string): number | null {
  const from = utcDay(start);
  const to = utcDay(end);
  if (from === null || to === null) return null;
  return Math.round((to - from) / 86_400_000);
}

export function numericOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Primer día `YYYY-MM-DD` de un texto de fecha, o null. */
export function dayOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (!match?.[1] || utcDay(match[1]) === null) return null;
  return match[1];
}

export function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Solo un documento en sec.gov. Otra URL no se muestra. */
export function secSourceUrl(value: string | null): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname !== "www.sec.gov" && url.hostname !== "sec.gov") return null;
  return url.toString();
}

/**
 * Acciones en circulación × último cierre.
 * Vacío si falta uno de los dos, si no son positivos, o si el recuento
 * no está a menos de `SHARES_MAX_AGE_DAYS` del cierre (un recuento viejo
 * no se presenta como capitalización de hoy).
 */
export function marketCapUsd(
  sharesOutstanding: number | null,
  lastClose: number | null,
  sharesAsOf: string | null,
  lastCloseDate: string | null,
): number | null {
  if (!positive(sharesOutstanding) || !positive(lastClose)) return null;
  if (!sharesAsOf || !lastCloseDate) return null;
  const gap = calendarDaysBetween(sharesAsOf, lastCloseDate);
  if (gap === null || Math.abs(gap) > SHARES_MAX_AGE_DAYS) return null;
  return sharesOutstanding * lastClose;
}

/** Último cierre / EPS TTM. Vacío si el EPS no es positivo. */
export function priceToEarnings(lastClose: number | null, epsTtm: number | null): number | null {
  if (!positive(lastClose) || epsTtm === null || !Number.isFinite(epsTtm) || epsTtm <= 0) return null;
  return lastClose / epsTtm;
}

/** Dividendos por acción TTM / último cierre. Vacío si falta el dividendo o el cierre. */
export function dividendYield(dividendsPerShareTtm: number | null, lastClose: number | null): number | null {
  if (dividendsPerShareTtm === null || !Number.isFinite(dividendsPerShareTtm) || dividendsPerShareTtm < 0) return null;
  if (!positive(lastClose)) return null;
  return dividendsPerShareTtm / lastClose;
}

export function companyView(input: CompanyFactsInput): CompanyFactsView {
  const sharesRaw = finiteOrNull(input.sharesOutstanding);
  const sharesOutstanding = sharesRaw !== null && sharesRaw > 0 ? sharesRaw : null;
  const lastClose = finiteOrNull(input.lastClose);
  const epsTtm = finiteOrNull(input.epsTtm);
  const dividendsRaw = finiteOrNull(input.dividendsPerShareTtm);
  const dividends = dividendsRaw !== null && dividendsRaw >= 0 ? dividendsRaw : null;
  return {
    symbol: input.symbol,
    underlying: input.underlying,
    name: input.name,
    sector: input.sector,
    sic: input.sic,
    exchange: input.exchange,
    fiscalYearEnd: input.fiscalYearEnd,
    sharesOutstanding,
    sharesAsOf: input.sharesAsOf,
    lastClose,
    lastCloseDate: input.lastCloseDate,
    marketCapUsd: marketCapUsd(sharesOutstanding, lastClose, input.sharesAsOf, input.lastCloseDate),
    pe: priceToEarnings(lastClose, epsTtm),
    dividendYield: dividendYield(dividends, lastClose),
    epsTtm,
    epsPeriodEnd: input.epsPeriodEnd,
    revenueTtm: finiteOrNull(input.revenueTtm),
    netIncomeTtm: finiteOrNull(input.netIncomeTtm),
    dividendsPerShareTtm: dividends,
    last10k: input.last10k,
    last10q: input.last10q,
    lastFilingForm: input.lastFilingForm,
    source: "sec-edgar",
    sourceUrl: secSourceUrl(input.sourceUrl),
    updatedAt: input.updatedAt,
  };
}

export function latestFiling(input: {
  last10k: string | null;
  last10q: string | null;
  lastFilingForm: string | null;
}): { form: "10-K" | "10-Q"; date: string } | null {
  const annual = input.last10k;
  const quarter = input.last10q;
  if (input.lastFilingForm === "10-K" && annual) return { form: "10-K", date: annual };
  if (input.lastFilingForm === "10-Q" && quarter) return { form: "10-Q", date: quarter };
  if (annual && quarter) return annual >= quarter ? { form: "10-K", date: annual } : { form: "10-Q", date: quarter };
  if (annual) return { form: "10-K", date: annual };
  if (quarter) return { form: "10-Q", date: quarter };
  return null;
}

/** Fecha de calendario, sin correr el día por la zona horaria. */
export function formatIsoDate(iso: string, locale: FactLocale): string | null {
  const day = dayOrNull(iso);
  if (!day) return null;
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, date)),
  );
}

export function formatUsdCompact(value: number, locale: FactLocale): string | null {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatUsdAmount(value: number, locale: FactLocale): string | null {
  if (!Number.isFinite(value)) return null;
  const digits = Math.abs(value) > 0 && Math.abs(value) < 1 ? 4 : 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatMultiple(value: number, locale: FactLocale): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

/** `ratio` es dividendos / cierre: 0,015 → 1,50 %. */
export function formatYield(ratio: number, locale: FactLocale): string | null {
  if (!Number.isFinite(ratio) || ratio < 0) return null;
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(ratio);
}

const VIEW_NUMBERS = [
  "sharesOutstanding",
  "lastClose",
  "marketCapUsd",
  "pe",
  "dividendYield",
  "epsTtm",
  "revenueTtm",
  "netIncomeTtm",
  "dividendsPerShareTtm",
] as const;

const VIEW_STRINGS = [
  "symbol",
  "underlying",
  "name",
  "sector",
  "sic",
  "exchange",
  "fiscalYearEnd",
  "sharesAsOf",
  "lastCloseDate",
  "epsPeriodEnd",
  "last10k",
  "last10q",
  "lastFilingForm",
  "sourceUrl",
  "updatedAt",
] as const;

/** La tarjeta solo pinta un objeto con esta forma. Si no, no muestra nada. */
export function readCompanyFactsView(value: unknown): CompanyFactsView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.source !== "sec-edgar") return null;
  if (typeof row.symbol !== "string" || row.symbol.trim() === "") return null;
  if (typeof row.underlying !== "string" || row.underlying.trim() === "") return null;
  const view: Record<string, unknown> = { source: "sec-edgar", symbol: row.symbol, underlying: row.underlying };
  for (const key of VIEW_NUMBERS) {
    const parsed = numberOrNullField(row[key]);
    if (parsed === undefined) return null;
    view[key] = parsed;
  }
  for (const key of VIEW_STRINGS) {
    if (key === "symbol" || key === "underlying") continue;
    const parsed = stringOrNullField(row[key]);
    if (parsed === undefined) return null;
    view[key] = parsed;
  }
  return view as unknown as CompanyFactsView;
}

function positive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function utcDay(iso: string): number | null {
  const match = DAY_RE.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return time;
}

function numberOrNullField(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function stringOrNullField(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

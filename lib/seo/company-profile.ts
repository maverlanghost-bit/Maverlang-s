/**
 * Perfil público de una empresa con los datos que la SEC (EDGAR) ya trae al repo.
 * Fuente única: `data/company-facts.snapshot.json` (lo genera
 * scripts/company-facts-snapshot.mjs). Sin red, sin Supabase y sin `server-only`:
 * los tests lo importan directo.
 *
 * Regla de datos: una cifra que no viene en el snapshot queda en `null` y no se
 * muestra. Nunca se rellena con 0 ni se estima.
 */
import snapshot from "@/data/company-facts.snapshot.json";

export type CompanyProfile = {
  ticker: string;
  kind: "company" | "foreign" | "fund";
  name: string | null;
  cik: string;
  sic: string | null;
  sicDescription: string | null;
  exchange: string | null;
  fiscalYearEnd: string | null;
  sharesOutstanding: number | null;
  sharesAsOf: string | null;
  epsTtm: number | null;
  epsPeriodEnd: string | null;
  revenueTtm: number | null;
  netIncomeTtm: number | null;
  dividendsPerShareTtm: number | null;
  last10k: string | null;
  last10q: string | null;
  lastFilingForm: string | null;
  sourceUrl: string | null;
  reportCurrency: string | null;
  fundFamily: string | null;
  fundNetAssets: number | null;
  fundReportDate: string | null;
  fundHoldingsCount: number | null;
  fundTopHoldings: { name: string; pct: number | null }[] | null;
};

type RawRecord = Record<string, unknown>;

/** El JSON se lee como registro suelto: el índice se arma con claves arbitrarias. */
const SNAPSHOT = snapshot as unknown as { generatedAt?: unknown; rows?: unknown };

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** Tope de compacidad para el importe: es-CL, coma decimal, punto de miles. */
const COMPACT_NUMBER = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
const WHOLE_NUMBER = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

/** Clave del snapshot: mayúsculas y `.` → `-` (`BRK.B` y `BRK-B` dan `BRK-B`). */
function normalizeTicker(value: string): string {
  return value.trim().toUpperCase().replace(/\./g, "-");
}

function asRecord(value: unknown): RawRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RawRecord;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** SIC y CIK llegan como texto; un número se respeta sin decimales. */
function codeOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return textOrNull(value);
}

function kindOf(value: unknown): CompanyProfile["kind"] | null {
  if (value === "company" || value === "foreign" || value === "fund") return value;
  return null;
}

/** Mayores posiciones del fondo: sólo entran filas con nombre. */
function holdingsOf(value: unknown): { name: string; pct: number | null }[] | null {
  if (!Array.isArray(value)) return null;
  const rows: { name: string; pct: number | null }[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    const name = textOrNull(record.name);
    if (!name) continue;
    rows.push({ name, pct: numberOrNull(record.pct) });
  }
  return rows.length > 0 ? rows : null;
}

function toProfile(ticker: string, row: RawRecord): CompanyProfile | null {
  const kind = kindOf(row.kind);
  const cik = codeOrNull(row.cik);
  if (!kind || !cik) return null;
  return {
    ticker,
    kind,
    name: textOrNull(row.name),
    cik,
    sic: codeOrNull(row.sic),
    sicDescription: textOrNull(row.sic_description),
    exchange: textOrNull(row.exchange),
    fiscalYearEnd: textOrNull(row.fiscal_year_end),
    sharesOutstanding: numberOrNull(row.shares_outstanding),
    sharesAsOf: textOrNull(row.shares_as_of),
    epsTtm: numberOrNull(row.eps_ttm),
    epsPeriodEnd: textOrNull(row.eps_period_end),
    revenueTtm: numberOrNull(row.revenue_ttm),
    netIncomeTtm: numberOrNull(row.net_income_ttm),
    dividendsPerShareTtm: numberOrNull(row.dividends_per_share_ttm),
    last10k: textOrNull(row.last_10k),
    last10q: textOrNull(row.last_10q),
    lastFilingForm: textOrNull(row.last_filing_form),
    sourceUrl: textOrNull(row.source_url),
    reportCurrency: textOrNull(row.report_currency),
    fundFamily: textOrNull(row.fund_family),
    fundNetAssets: numberOrNull(row.fund_net_assets),
    fundReportDate: textOrNull(row.fund_report_date),
    fundHoldingsCount: numberOrNull(row.fund_holdings_count),
    fundTopHoldings: holdingsOf(row.fund_top_holdings),
  };
}

function buildIndex(): Map<string, CompanyProfile> {
  const map = new Map<string, CompanyProfile>();
  const rows = asRecord(SNAPSHOT.rows);
  if (!rows) return map;
  for (const [key, value] of Object.entries(rows)) {
    const row = asRecord(value);
    if (!row) continue;
    const ticker = normalizeTicker(key);
    if (!ticker) continue;
    const profile = toProfile(ticker, row);
    if (profile) map.set(ticker, profile);
  }
  return map;
}

/** Índice en memoria: se arma una vez al importar el módulo. */
const INDEX: ReadonlyMap<string, CompanyProfile> = buildIndex();

function snapshotDay(): string {
  const raw = textOrNull(SNAPSHOT.generatedAt);
  if (!raw) return "";
  const day = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

/** Fecha del snapshot (`generatedAt`), en `YYYY-MM-DD`. Vacía si el JSON no la trae. */
export const COMPANY_SNAPSHOT_DATE: string = snapshotDay();

/**
 * Perfil de la empresa por ticker. Acepta `AAPL`, `aapl`, `BRK.B` o `BRK-B`.
 * Null si el ticker no está en el snapshot (nunca se inventa un perfil).
 */
export function companyProfile(ticker: string): CompanyProfile | null {
  if (typeof ticker !== "string") return null;
  const key = normalizeTicker(ticker);
  if (!key) return null;
  return INDEX.get(key) ?? null;
}

/**
 * Importe en dólares, compacto y en es-CL: `US$478,8 mil millones`,
 * `US$1,2 billones` (10^12) o `US$850 millones`. Negativos con signo delante.
 * Null si no hay cifra: no se muestra un 0 que la SEC no publicó.
 */
export function formatUsdCompact(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${sign}US$${COMPACT_NUMBER.format(abs / 1_000_000_000_000)} billones`;
  if (abs >= 1_000_000_000) return `${sign}US$${COMPACT_NUMBER.format(abs / 1_000_000_000)} mil millones`;
  if (abs >= 1_000_000) return `${sign}US$${COMPACT_NUMBER.format(abs / 1_000_000)} millones`;
  return `${sign}US$${WHOLE_NUMBER.format(abs)}`;
}

/** `"0926"` → `"26 de septiembre"`. Null si el formato no es MM/DD válido. */
export function formatFiscalYearEnd(mmdd: string | null): string | null {
  if (typeof mmdd !== "string") return null;
  const match = /^(\d{2})(\d{2})$/.exec(mmdd.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const name = MONTHS_ES[month - 1];
  if (!name) return null;
  return `${day} de ${name}`;
}

// node --experimental-strip-types scripts/company-facts.mjs [--dry-run] [--symbols AAPL,BRK-B]
//
// Ficha pública de la SEC (EDGAR) para las acciones que hoy se pueden comprar.
// User-Agent identificable y 4 req/s (el tope de la SEC es 10).
// Clave = toYahooSymbol(ticker) SIN mic, la misma que underlying_prices.
//
// Tres tipos de fila:
// - Empresa de EE.UU. (10-K / 10-Q, us-gaap): como antes.
// - Emisor extranjero (20-F / 40-F, ifrs-full o us-gaap): ingresos y utilidad
//   del último año en USD. Si informa en otra moneda se convierte con el tipo
//   de cambio del BCE (frankfurter.dev, gratis y sin clave). Sin EPS ni P/E.
// - Fondo cotizado (ETF): nombre y último N-PORT público (patrimonio y mayores
//   posiciones si la migración 0039 ya está aplicada).
// Sin datos usables: no hay fila; esas claves salen en el resumen JSON.
//
// Entorno: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_URL, y SUPABASE_SECRET_KEY
// (o SUPABASE_SERVICE_ROLE_KEY). COMPANY_FACTS_DRY_RUN y COMPANY_FACTS_SYMBOLS
// los usa el workflow. --dry-run no escribe.
import { createClient } from "@supabase/supabase-js";
import { buyableAssetRows } from "../lib/catalog/safety-core.mjs";
import { toYahooSymbol } from "../lib/market/yahoo-symbol.ts";
import {
  EDGAR_FUND_TICKERS_URL,
  EDGAR_MIN_INTERVAL_MS,
  EDGAR_TICKERS_URL,
  EDGAR_USER_AGENT,
  buildCompanyFactRecord,
  describeFilings,
  describeForeignFilings,
  edgarCompanyFactsUrl,
  edgarSubmissionsUrl,
  edgarTicker,
  filingRowsFromEdgar,
  foreignMetricsFromCompanyFacts,
  fundFilingsAtomUrl,
  hasUsableMetrics,
  indexCompanyTickers,
  indexFundTickers,
  latestFundFilingFromAtom,
  metricsFromCompanyFacts,
  nportPrimaryDocUrl,
  olderSubmissionNames,
  olderSubmissionUrl,
  padCik,
  parseNport,
  profileFromSubmissions,
} from "../lib/services/company-facts.ts";

const rawArgs = [];
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--") && arg.includes("=")) {
    const eq = arg.indexOf("=");
    rawArgs.push(arg.slice(0, eq), arg.slice(eq + 1));
  } else {
    rawArgs.push(arg);
  }
}
const args = Object.fromEntries(
  rawArgs
    .map((a, i, all) =>
      a.startsWith("--")
        ? [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]
        : [],
    )
    .filter((pair) => pair.length === 2),
);

function flag(value) {
  if (value === true) return true;
  if (value === false || value === undefined || value === null || value === "") return false;
  const text = String(value).trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function errorText(error) {
  const message =
    error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
  return message.slice(0, 200);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DRY = flag(args["dry-run"]) || flag(process.env.COMPANY_FACTS_DRY_RUN);
const PAGE = 1000;
const UPSERT = 200;
const POOL = 3;
const EXTRA_FILES = 2;
const HEADERS = { "User-Agent": EDGAR_USER_AGENT, Accept: "application/json" };
const FX_URL = "https://api.frankfurter.dev/v1/latest?base=USD";
/** Columnas de la migración 0039. Solo se escriben si ya existen. */
const EXTRA_KEYS = [
  "report_currency",
  "fund_family",
  "fund_net_assets",
  "fund_report_date",
  "fund_holdings_count",
  "fund_top_holdings",
];

if (args.symbols === true) {
  console.error("Falta la lista de --symbols (ejemplo: --symbols AAPL,BRK-B).");
  process.exit(1);
}

const wanted = (() => {
  const raw = args.symbols !== undefined ? String(args.symbols) : text(process.env.COMPANY_FACTS_SYMBOLS);
  if (!raw || raw === "null" || raw === "undefined") return null;
  const set = new Set();
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (!token) continue;
    const key = toYahooSymbol(token);
    if (key) set.add(key);
  }
  return set.size > 0 ? set : null;
})();

const supabaseUrl = text(process.env.SUPABASE_URL) || text(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = text(process.env.SUPABASE_SECRET_KEY) || text(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Faltan SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY).",
  );
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

let nextSlot = 0;
let paceChain = Promise.resolve();

function pace() {
  const run = paceChain.then(async () => {
    const now = Date.now();
    const start = Math.max(now, nextSlot);
    nextSlot = start + EDGAR_MIN_INTERVAL_MS;
    const wait = start - now;
    if (wait > 0) await sleep(wait);
  });
  paceChain = run.then(
    () => {},
    () => {},
  );
  return run;
}

async function edgarGet(url, attempt = 1, accept = "application/json") {
  await pace();
  const response = await fetch(url, {
    headers: { ...HEADERS, Accept: accept },
    signal: AbortSignal.timeout(60_000),
  });
  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const extra = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * attempt;
    await sleep(Math.min(extra, 15_000));
    return edgarGet(url, attempt + 1, accept);
  }
  return response;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error("respuesta EDGAR no es JSON");
  }
}

/** Tipo de cambio del BCE (unidades por 1 USD). Si falla, solo se aceptan cifras en USD. */
async function loadUsdRates() {
  try {
    const response = await fetch(FX_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return { rates: new Map(), date: null };
    const body = await response.json();
    const rates = new Map();
    for (const [code, value] of Object.entries(body?.rates ?? {})) {
      if (typeof value === "number" && value > 0) rates.set(code, value);
    }
    return { rates, date: typeof body?.date === "string" ? body.date : null };
  } catch {
    return { rates: new Map(), date: null };
  }
}

async function loadCatalog() {
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("assets")
      .select("symbol,underlying,company_ticker,exchange_mic,issuer,enabled,curated,is_trading_halted,safety_status")
      .order("symbol", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message ?? "no se pudo leer public.assets");
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  const keys = new Set();
  for (const row of buyableAssetRows(all)) {
    const raw = text(row.underlying) || text(row.company_ticker);
    if (!raw) continue;
    const stored = toYahooSymbol(raw);
    if (stored) keys.add(stored);
  }
  return [...keys];
}

function blankRow(underlying, cik) {
  return {
    underlying,
    cik: padCik(cik),
    name: null,
    sic: null,
    sic_description: null,
    exchange: null,
    fiscal_year_end: null,
    shares_outstanding: null,
    shares_as_of: null,
    eps_ttm: null,
    eps_period_end: null,
    revenue_ttm: null,
    net_income_ttm: null,
    dividends_per_share_ttm: null,
    last_10k: null,
    last_10q: null,
    last_filing_form: null,
    source_url: null,
  };
}

function withExtras(row, extras = {}) {
  const next = { ...row };
  for (const key of EXTRA_KEYS) next[key] = extras[key] ?? null;
  return next;
}

let usdRate = () => null;

async function loadForeign(stored, cik, factsBody, today) {
  const foreign = foreignMetricsFromCompanyFacts(factsBody, usdRate, today);
  if (foreign.revenueUsd === null && foreign.netIncomeUsd === null) {
    return { status: "skip", reason: "sin cifras usables" };
  }
  const response = await edgarGet(edgarSubmissionsUrl(cik));
  const submissions = response.ok ? await readJson(response) : null;
  const profile = profileFromSubmissions(submissions);
  const filings = describeForeignFilings(submissions ? filingRowsFromEdgar(submissions) : [], cik);
  if (!filings.lastAnnual) return { status: "skip", reason: "sin informe anual 20-F/40-F" };
  const row = {
    ...blankRow(stored, cik),
    name: profile.name,
    sic: profile.sic,
    sic_description: profile.sicDescription,
    exchange: profile.exchange,
    fiscal_year_end: profile.fiscalYearEnd,
    // En emisores extranjeros no hay EPS: esta fecha es el cierre del período de ingresos/utilidad.
    eps_period_end: foreign.periodEnd,
    revenue_ttm: foreign.revenueUsd,
    net_income_ttm: foreign.netIncomeUsd,
    last_10k: filings.lastAnnual,
    last_filing_form: filings.form,
    source_url: filings.sourceUrl,
  };
  return { status: "ok", kind: "foreign", row: withExtras(row, { report_currency: foreign.currency }) };
}

async function loadFund(stored, fund) {
  let filing = null;
  let summary = null;
  if (fund.seriesId) {
    const atom = await edgarGet(fundFilingsAtomUrl(fund.seriesId), 1, "application/atom+xml");
    if (atom.ok) filing = latestFundFilingFromAtom(await atom.text());
    if (filing) {
      const doc = await edgarGet(nportPrimaryDocUrl(filing.indexUrl), 1, "application/xml");
      if (doc.ok) summary = parseNport(await doc.text());
    }
  }
  let name = summary?.seriesName ?? null;
  let family = summary?.registrant ?? null;
  if (!name) {
    const response = await edgarGet(edgarSubmissionsUrl(fund.cik));
    if (response.ok) {
      const profile = profileFromSubmissions(await readJson(response));
      name = profile.name;
      family = family ?? profile.name;
    }
  }
  if (!name) return { status: "skip", reason: "fondo sin datos en EDGAR" };
  const row = {
    ...blankRow(stored, fund.cik),
    name,
    last_10q: filing?.filingDate ?? null,
    last_filing_form: filing ? "NPORT-P" : "FUND",
    source_url: filing?.indexUrl ?? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${padCik(fund.cik)}`,
  };
  return {
    status: "ok",
    kind: "fund",
    row: withExtras(row, {
      fund_family: family && family !== name ? family : null,
      fund_net_assets: summary?.netAssets ?? null,
      fund_report_date: summary?.reportDate ?? null,
      fund_holdings_count: summary?.holdingsCount ?? null,
      fund_top_holdings: summary && summary.top.length > 0 ? summary.top : null,
    }),
  };
}

async function loadOne(stored, cik, today, fundIndex) {
  const factsResponse = await edgarGet(edgarCompanyFactsUrl(cik));
  if (factsResponse.status === 404) {
    // Sin XBRL: casi siempre un fondo (SPY es un UIT sin N-PORT).
    return loadFund(stored, { cik, seriesId: fundIndex.get(edgarTicker(stored))?.seriesId ?? null });
  }
  if (!factsResponse.ok) throw new Error(`companyfacts HTTP ${factsResponse.status}`);
  const factsBody = await readJson(factsResponse);
  const metrics = metricsFromCompanyFacts(factsBody);
  if (!hasUsableMetrics(metrics, today)) return loadForeign(stored, cik, factsBody, today);

  const submissionsResponse = await edgarGet(edgarSubmissionsUrl(cik));
  if (submissionsResponse.status === 404) {
    const row = buildCompanyFactRecord({
      underlying: stored,
      cik,
      metrics,
      profile: profileFromSubmissions(null),
      filings: describeFilings([], cik),
      today,
    });
    return row ? { status: "ok", kind: "company", row: withExtras(row, { report_currency: "USD" }) } : { status: "skip", reason: "sin cifras usables" };
  }
  if (!submissionsResponse.ok) throw new Error(`submissions HTTP ${submissionsResponse.status}`);
  const submissions = await readJson(submissionsResponse);
  let filingRows = filingRowsFromEdgar(submissions);
  let described = describeFilings(filingRows, cik);
  let extras = 0;
  for (const name of olderSubmissionNames(submissions)) {
    if (described.last10k && described.last10q) break;
    if (extras >= EXTRA_FILES) break;
    const url = olderSubmissionUrl(name);
    if (!url) continue;
    extras += 1;
    const extra = await edgarGet(url);
    if (!extra.ok) continue;
    filingRows = filingRows.concat(filingRowsFromEdgar(await readJson(extra)));
    described = describeFilings(filingRows, cik);
  }
  const row = buildCompanyFactRecord({
    underlying: stored,
    cik,
    metrics,
    profile: profileFromSubmissions(submissions),
    filings: described,
    today,
  });
  return row ? { status: "ok", kind: "company", row: withExtras(row, { report_currency: "USD" }) } : { status: "skip", reason: "sin cifras usables" };
}

try {
  const tickersResponse = await edgarGet(EDGAR_TICKERS_URL);
  if (!tickersResponse.ok) throw new Error(`company_tickers HTTP ${tickersResponse.status}`);
  const cikByTicker = indexCompanyTickers(await readJson(tickersResponse));
  const fundsResponse = await edgarGet(EDGAR_FUND_TICKERS_URL);
  const fundIndex = fundsResponse.ok ? indexFundTickers(await readJson(fundsResponse)) : new Map();

  const fx = await loadUsdRates();
  usdRate = (code) => fx.rates.get(code) ?? null;

  const probe = await db.from("company_facts").select("fund_net_assets").limit(1);
  const extraColumns = !probe.error;

  const catalog = await loadCatalog();
  let jobs = catalog;
  if (wanted) jobs = jobs.filter((key) => wanted.has(key));

  const today = new Date().toISOString().slice(0, 10);
  const rows = [];
  const skippedList = [];
  const failures = [];
  const byKind = { company: 0, foreign: 0, fund: 0 };
  let ok = 0;
  let skipped = 0;
  let fail = 0;
  let done = 0;
  const queue = [...jobs];
  const pool = Math.min(POOL, Math.max(queue.length, 1));
  await Promise.all(
    Array.from({ length: pool }, async () => {
      for (let stored; (stored = queue.shift()); ) {
        const cik = cikByTicker.get(edgarTicker(stored));
        try {
          let result;
          if (cik) {
            result = await loadOne(stored, cik, today, fundIndex);
          } else {
            const fund = fundIndex.get(edgarTicker(stored));
            result = fund ? await loadFund(stored, fund) : { status: "skip", reason: "sin CIK en EDGAR" };
          }
          if (result.status === "ok") {
            ok += 1;
            byKind[result.kind] += 1;
            rows.push(result.row);
          } else {
            skipped += 1;
            skippedList.push({ underlying: stored, reason: result.reason });
          }
        } catch (error) {
          fail += 1;
          failures.push({ underlying: stored, error: errorText(error) });
        }
        done += 1;
        if (done % 25 === 0) console.error(`edgar ${done}/${jobs.length}`);
      }
    }),
  );

  let writeError = null;
  if (!DRY && rows.length > 0) {
    const stamped = rows.map((row) => {
      const next = { ...row, updated_at: new Date().toISOString() };
      if (!extraColumns) for (const key of EXTRA_KEYS) delete next[key];
      return next;
    });
    for (let offset = 0; offset < stamped.length; offset += UPSERT) {
      const batch = stamped.slice(offset, offset + UPSERT);
      const { error } = await db.from("company_facts").upsert(batch, { onConflict: "underlying" });
      if (error) {
        writeError = errorText(error);
        break;
      }
    }
  }

  const summary = {
    catalog: catalog.length,
    symbols: jobs.length,
    ok,
    byKind,
    skipped,
    fail,
    rows: rows.length,
    dry: DRY,
    extraColumns,
    fxDate: fx.date,
    skippedList,
    failures,
  };
  if (writeError) summary.writeError = writeError;
  console.log(JSON.stringify(summary));
  if (writeError || catalog.length === 0 || (jobs.length > 0 && ok === 0 && skipped === 0)) process.exit(1);
} catch (error) {
  console.error(errorText(error));
  process.exit(1);
}

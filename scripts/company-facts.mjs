// node --experimental-strip-types scripts/company-facts.mjs [--dry-run] [--symbols AAPL,BRK-B]
//
// Ficha pública de la SEC (EDGAR) para las acciones que hoy se pueden comprar.
// User-Agent identificable y 4 req/s (el tope de la SEC es 10).
// Clave = toYahooSymbol(ticker) SIN mic, la misma que underlying_prices.
// Sin CIK, sin XBRL (ETF, emisor extranjero) o sin cifra usable: no hay fila.
// Esas claves salen en el resumen JSON. No usa Yahoo, FMP, Finnhub ni Alpha Vantage.
//
// Entorno: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_URL, y SUPABASE_SECRET_KEY
// (o SUPABASE_SERVICE_ROLE_KEY). COMPANY_FACTS_DRY_RUN y COMPANY_FACTS_SYMBOLS
// los usa el workflow. --dry-run no escribe.
import { createClient } from "@supabase/supabase-js";
import { buyableAssetRows } from "../lib/catalog/safety-core.mjs";
import { toYahooSymbol } from "../lib/market/yahoo-symbol.ts";
import {
  EDGAR_MIN_INTERVAL_MS,
  EDGAR_TICKERS_URL,
  EDGAR_USER_AGENT,
  buildCompanyFactRecord,
  describeFilings,
  edgarCompanyFactsUrl,
  edgarSubmissionsUrl,
  edgarTicker,
  filingRowsFromEdgar,
  indexCompanyTickers,
  metricsFromCompanyFacts,
  olderSubmissionNames,
  olderSubmissionUrl,
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

async function edgarGet(url, attempt = 1) {
  await pace();
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const extra = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * attempt;
    await sleep(Math.min(extra, 15_000));
    return edgarGet(url, attempt + 1);
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

async function loadOne(stored, cik, today) {
  const factsResponse = await edgarGet(edgarCompanyFactsUrl(cik));
  if (factsResponse.status === 404) return { status: "skip", reason: "sin XBRL" };
  if (!factsResponse.ok) throw new Error(`companyfacts HTTP ${factsResponse.status}`);
  const metrics = metricsFromCompanyFacts(await readJson(factsResponse));

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
    return row ? { status: "ok", row } : { status: "skip", reason: "sin cifras usables" };
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
  return row ? { status: "ok", row } : { status: "skip", reason: "sin cifras usables" };
}

try {
  const tickersResponse = await edgarGet(EDGAR_TICKERS_URL);
  if (!tickersResponse.ok) throw new Error(`company_tickers HTTP ${tickersResponse.status}`);
  const cikByTicker = indexCompanyTickers(await readJson(tickersResponse));

  const catalog = await loadCatalog();
  let jobs = catalog;
  if (wanted) jobs = jobs.filter((key) => wanted.has(key));

  const today = new Date().toISOString().slice(0, 10);
  const rows = [];
  const skippedList = [];
  const failures = [];
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
          if (!cik) {
            skipped += 1;
            skippedList.push({ underlying: stored, reason: "sin CIK en EDGAR" });
          } else {
            const result = await loadOne(stored, cik, today);
            if (result.status === "ok") {
              ok += 1;
              rows.push(result.row);
            } else {
              skipped += 1;
              skippedList.push({ underlying: stored, reason: result.reason });
            }
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
    const stamped = rows.map((row) => ({ ...row, updated_at: new Date().toISOString() }));
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
    skipped,
    fail,
    rows: rows.length,
    dry: DRY,
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

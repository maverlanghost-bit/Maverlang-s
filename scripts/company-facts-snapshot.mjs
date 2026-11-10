// node --experimental-strip-types scripts/company-facts-snapshot.mjs
// Copia sin Supabase de scripts/company-facts.mjs: lee EDGAR (SEC) y escribe
// data/company-facts.snapshot.json para las fichas publicas. Solo lectura de red.
import { readFileSync, writeFileSync } from "node:fs";
import {
  EDGAR_FUND_TICKERS_URL, EDGAR_MIN_INTERVAL_MS, EDGAR_TICKERS_URL, EDGAR_USER_AGENT,
  buildCompanyFactRecord, describeFilings, describeForeignFilings, edgarCompanyFactsUrl,
  edgarSubmissionsUrl, edgarTicker, filingRowsFromEdgar, foreignMetricsFromCompanyFacts,
  fundFilingsAtomUrl, hasUsableMetrics, indexCompanyTickers, indexFundTickers,
  latestFundFilingFromAtom, metricsFromCompanyFacts, nportPrimaryDocUrl, olderSubmissionNames,
  olderSubmissionUrl, padCik, parseNport, profileFromSubmissions,
} from "../lib/services/company-facts.ts";

const HEADERS = { "User-Agent": EDGAR_USER_AGENT, Accept: "application/json" };
const FX_URL = "https://api.frankfurter.dev/v1/latest?base=USD";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errorText = (e) => String(e && e.message ? e.message : e).slice(0, 200);

function universe() {
  const keys = new Set();
  const a = readFileSync("config/tickers.generated.ts", "utf8");
  for (const m of a.matchAll(/underlying:\s*"([^"]+)"/g)) keys.add(edgarTicker(m[1]));
  const b = readFileSync("config/ondo.generated.ts", "utf8");
  for (const m of b.matchAll(/\bticker:\s*"([^"]+)"/g)) keys.add(edgarTicker(m[1]));
  keys.delete("");
  return [...keys].sort();
}

let nextSlot = 0; let chain = Promise.resolve();
function pace() {
  const run = chain.then(async () => { const now = Date.now(); const s = Math.max(now, nextSlot); nextSlot = s + EDGAR_MIN_INTERVAL_MS; if (s > now) await sleep(s - now); });
  chain = run.then(() => {}, () => {}); return run;
}
async function edgarGet(url, attempt = 1, accept = "application/json") {
  await pace();
  const r = await fetch(url, { headers: { ...HEADERS, Accept: accept }, signal: AbortSignal.timeout(60_000) });
  if ((r.status === 429 || r.status >= 500) && attempt < 4) { await sleep(1000 * attempt); return edgarGet(url, attempt + 1, accept); }
  return r;
}
async function readJson(r) { try { return await r.json(); } catch { throw new Error("respuesta EDGAR no es JSON"); } }
async function loadUsdRates() {
  try { const r = await fetch(FX_URL, { signal: AbortSignal.timeout(20_000) }); if (!r.ok) return { rates: new Map(), date: null };
    const body = await r.json(); const rates = new Map(); for (const [c, v] of Object.entries(body?.rates ?? {})) if (typeof v === "number" && v > 0) rates.set(c, v);
    return { rates, date: body?.date ?? null }; } catch { return { rates: new Map(), date: null }; }
}
function blankRow(underlying, cik) {
  return { underlying, cik: padCik(cik), name: null, sic: null, sic_description: null, exchange: null, fiscal_year_end: null,
    shares_outstanding: null, shares_as_of: null, eps_ttm: null, eps_period_end: null, revenue_ttm: null, net_income_ttm: null,
    dividends_per_share_ttm: null, last_10k: null, last_10q: null, last_filing_form: null, source_url: null };
}
let usdRate = () => null;
async function loadForeign(stored, cik, factsBody, today) {
  const f = foreignMetricsFromCompanyFacts(factsBody, usdRate, today);
  if (f.revenueUsd === null && f.netIncomeUsd === null) return { status: "skip", reason: "sin cifras usables" };
  const r = await edgarGet(edgarSubmissionsUrl(cik)); const sub = r.ok ? await readJson(r) : null;
  const p = profileFromSubmissions(sub); const fl = describeForeignFilings(sub ? filingRowsFromEdgar(sub) : [], cik);
  if (!fl.lastAnnual) return { status: "skip", reason: "sin informe anual 20-F/40-F" };
  return { status: "ok", kind: "foreign", row: { ...blankRow(stored, cik), name: p.name, sic: p.sic, sic_description: p.sicDescription, exchange: p.exchange,
    fiscal_year_end: p.fiscalYearEnd, eps_period_end: f.periodEnd, revenue_ttm: f.revenueUsd, net_income_ttm: f.netIncomeUsd,
    last_10k: fl.lastAnnual, last_filing_form: fl.form, source_url: fl.sourceUrl, report_currency: f.currency, kind: "foreign" } };
}
async function loadFund(stored, fund) {
  let filing = null, summary = null;
  if (fund.seriesId) { const atom = await edgarGet(fundFilingsAtomUrl(fund.seriesId), 1, "application/atom+xml");
    if (atom.ok) filing = latestFundFilingFromAtom(await atom.text());
    if (filing) { const doc = await edgarGet(nportPrimaryDocUrl(filing.indexUrl), 1, "application/xml"); if (doc.ok) summary = parseNport(await doc.text()); } }
  let name = summary?.seriesName ?? null; let family = summary?.registrant ?? null;
  if (!name) { const r = await edgarGet(edgarSubmissionsUrl(fund.cik)); if (r.ok) { const p = profileFromSubmissions(await readJson(r)); name = p.name; family = family ?? p.name; } }
  if (!name) return { status: "skip", reason: "fondo sin datos en EDGAR" };
  return { status: "ok", kind: "fund", row: { ...blankRow(stored, fund.cik), name, last_10q: filing?.filingDate ?? null, last_filing_form: filing ? "NPORT-P" : "FUND",
    source_url: filing?.indexUrl ?? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${padCik(fund.cik)}`,
    fund_family: family && family !== name ? family : null, fund_net_assets: summary?.netAssets ?? null, fund_report_date: summary?.reportDate ?? null,
    fund_holdings_count: summary?.holdingsCount ?? null, fund_top_holdings: summary && summary.top.length > 0 ? summary.top : null, kind: "fund" } };
}
async function loadOne(stored, cik, today, fundIndex) {
  const fr = await edgarGet(edgarCompanyFactsUrl(cik));
  if (fr.status === 404) return loadFund(stored, { cik, seriesId: fundIndex.get(edgarTicker(stored))?.seriesId ?? null });
  if (!fr.ok) throw new Error(`companyfacts HTTP ${fr.status}`);
  const fb = await readJson(fr); const metrics = metricsFromCompanyFacts(fb);
  if (!hasUsableMetrics(metrics, today)) return loadForeign(stored, cik, fb, today);
  const sr = await edgarGet(edgarSubmissionsUrl(cik));
  let sub = null; if (sr.ok) sub = await readJson(sr); else if (sr.status !== 404) throw new Error(`submissions HTTP ${sr.status}`);
  let rows = sub ? filingRowsFromEdgar(sub) : []; let d = describeFilings(rows, cik); let extras = 0;
  for (const n of sub ? olderSubmissionNames(sub) : []) { if (d.last10k && d.last10q) break; if (extras >= 2) break; const u = olderSubmissionUrl(n); if (!u) continue; extras++;
    const x = await edgarGet(u); if (!x.ok) continue; rows = rows.concat(filingRowsFromEdgar(await readJson(x))); d = describeFilings(rows, cik); }
  const row = buildCompanyFactRecord({ underlying: stored, cik, metrics, profile: profileFromSubmissions(sub), filings: d, today });
  return row ? { status: "ok", kind: "company", row: { ...row, report_currency: "USD", kind: "company" } } : { status: "skip", reason: "sin cifras usables" };
}

const jobs = universe();
console.error(`universo ${jobs.length}`);
const cikByTicker = indexCompanyTickers(await readJson(await edgarGet(EDGAR_TICKERS_URL)));
const fr = await edgarGet(EDGAR_FUND_TICKERS_URL); const fundIndex = fr.ok ? indexFundTickers(await readJson(fr)) : new Map();
const fx = await loadUsdRates(); usdRate = (c) => fx.rates.get(c) ?? null;
const today = new Date().toISOString().slice(0, 10);
const out = {}; const skipped = []; const failures = []; let done = 0;
const queue = [...jobs];
await Promise.all(Array.from({ length: 3 }, async () => {
  for (let s; (s = queue.shift()); ) {
    const cik = cikByTicker.get(edgarTicker(s));
    try {
      let r; if (cik) r = await loadOne(s, cik, today, fundIndex); else { const f = fundIndex.get(edgarTicker(s)); r = f ? await loadFund(s, f) : { status: "skip", reason: "sin CIK en EDGAR" }; }
      if (r.status === "ok") out[s] = r.row; else skipped.push({ ticker: s, reason: r.reason });
    } catch (e) { failures.push({ ticker: s, error: errorText(e) }); }
    if (++done % 25 === 0) console.error(`edgar ${done}/${jobs.length}`);
  }
}));
const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
const file = { source: "SEC EDGAR (data.sec.gov companyfacts/submissions, N-PORT para fondos)", generatedAt: new Date().toISOString(), fxDate: fx.date,
  universe: jobs.length, count: Object.keys(sorted).length, skipped, failures, rows: sorted };
writeFileSync("data/company-facts.snapshot.json", JSON.stringify(file, null, 1) + "\n", "utf8");
console.log(JSON.stringify({ universe: jobs.length, ok: file.count, skipped: skipped.length, failures: failures.length }));

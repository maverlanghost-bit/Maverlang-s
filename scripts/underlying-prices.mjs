// node scripts/underlying-prices.mjs [--days 365] [--incremental-days 10] [--workers 8]
//   [--dry-run] [--only-missing] [--symbols A,B]
// Tope: 365 días aunque se pida más. ALL del gráfico equivale a 1 año.
//
// Catálogo: public.assets activo (enabled, safety_status distinto de hidden, hidden_at null),
// de a 1000. Ya no usa GENERATED_TICKERS.
//
// CLAVE en underlying_prices.underlying = toYahooSymbol(ticker) SIN mic
// (mayúsculas y "." → "-"). Ejemplos: "ADSD", "BRK-B", "625".
// La app lee la serie por esa clave. No mapea el mercado.
// El símbolo que se PIDE a Yahoo sí usa el MIC: toYahooSymbol(ticker, exchange_mic)
// ("ADSD" + XETR → "ADS.DE", "625" + XHKG → "0625.HK").
//
// Entorno: SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL, y SUPABASE_SECRET_KEY
// (o SUPABASE_SERVICE_ROLE_KEY si el nombre nuevo no está).
import { createClient } from "@supabase/supabase-js";
import { buyableAssetRows } from "../lib/catalog/safety-core.mjs";
import { toYahooSymbol } from "../lib/market/yahoo-symbol.ts";

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

function numberArg(value, fallback) {
  if (value === undefined || value === true) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function flag(value) {
  if (value === true) return true;
  if (value === false || value === undefined) return false;
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

const DAYS = Math.min(365, Math.max(1, Math.floor(numberArg(args.days, 365))));
const INC = Math.max(0, Math.floor(numberArg(args["incremental-days"], 10)));
const WORKERS = Math.min(32, Math.max(1, Math.floor(numberArg(args.workers, 8))));
const DRY = flag(args["dry-run"]);
const ONLY = flag(args["only-missing"]);
const PAGE = 1000;
const UPSERT = 500;
const YAHOO_OK = /^[A-Z0-9.-]{1,32}$/;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

if (args.symbols === true) {
  console.error("Falta la lista de --symbols (ejemplo: --symbols ADSD,AAPL).");
  process.exit(1);
}

const wanted = (() => {
  if (args.symbols === undefined) return null;
  const set = new Set();
  for (const part of String(args.symbols).split(",")) {
    const token = part.trim();
    if (!token) continue;
    set.add(token.toUpperCase().replace(/\./g, "-"));
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

async function loadCatalog() {
  // Sólo las que hoy se pueden comprar (misma regla que la app: buyableAssetRows).
  // La transición depende del catálogo completo, así que se lee todo y se filtra aquí.
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
  const byKey = new Map();
  for (const row of buyableAssetRows(all)) {
    const raw = text(row.underlying) || text(row.company_ticker);
    if (!raw) continue;
    // Sin MIC: la misma clave de hoy. Con MIC: sólo el pedido a Yahoo.
    const stored = toYahooSymbol(raw);
    if (!stored) continue;
    const exchangeMic = text(row.exchange_mic) || null;
    const prev = byKey.get(stored);
    if (prev && (prev.exchangeMic || !exchangeMic)) continue;
    byKey.set(stored, { stored, yahoo: toYahooSymbol(raw, exchangeMic), exchangeMic });
  }
  return [...byKey.values()];
}
async function loadFresh() {
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const fresh = new Set();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("underlying_prices")
      .select("underlying")
      .gte("date", since)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message ?? "no se pudo leer underlying_prices");
    const rows = data ?? [];
    for (const row of rows) {
      const key = text(row.underlying);
      if (key) fresh.add(key);
    }
    if (rows.length < PAGE) break;
  }
  return fresh;
}

async function withoutRows(items) {
  const flags = new Array(items.length).fill(false);
  const queue = items.map((item, index) => ({ item, index }));
  const pool = Math.min(WORKERS, Math.max(items.length, 1));
  await Promise.all(
    Array.from({ length: pool }, async () => {
      for (let next; (next = queue.shift()); ) {
        const { count, error } = await db
          .from("underlying_prices")
          .select("underlying", { count: "exact", head: true })
          .eq("underlying", next.item.stored);
        if (error) throw new Error(error.message ?? "no se pudo consultar underlying_prices");
        if ((count ?? 0) === 0) flags[next.index] = true;
      }
    }),
  );
  return items.filter((_, index) => flags[index]);
}

async function fetchEod(yahooSymbol, storedKey, days, attempt = 1) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${days}d&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1500 * attempt));
    return fetchEod(yahooSymbol, storedKey, days, attempt + 1);
  }
  if (!res.ok) throw new Error(`${storedKey} (${yahooSymbol}) HTTP ${res.status}`);
  const body = (await res.json())?.chart?.result?.[0];
  const ts = body?.timestamp ?? [];
  const close = body?.indicators?.adjclose?.[0]?.adjclose ?? body?.indicators?.quote?.[0]?.close ?? [];
  const tz = body?.meta?.exchangeTimezoneName ?? "America/New_York";
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  return ts
    .map((t, i) => ({
      underlying: storedKey,
      date: fmt.format(new Date(t * 1000)),
      close: Number(close[i]),
      source: "yahoo",
    }))
    .filter((row) => Number.isFinite(row.close) && row.close > 0);
}

try {
  const catalog = await loadCatalog();
  let jobs = catalog;
  if (wanted) jobs = jobs.filter((job) => wanted.has(job.stored));
  if (ONLY) jobs = await withoutRows(jobs);
  const fresh = ONLY ? new Set() : await loadFresh();

  const failures = [];
  const okRows = [];
  let ok = 0;
  let fail = 0;
  const queue = [...jobs];
  const pool = Math.min(WORKERS, Math.max(queue.length, 1));
  await Promise.all(
    Array.from({ length: pool }, async () => {
      for (let job; (job = queue.shift()); ) {
        if (!YAHOO_OK.test(job.yahoo)) {
          fail += 1;
          failures.push({ underlying: job.stored, yahoo: job.yahoo, error: "símbolo Yahoo inválido" });
          continue;
        }
        try {
          const days = fresh.has(job.stored) && INC > 0 ? INC : DAYS;
          const data = await fetchEod(job.yahoo, job.stored, days);
          ok += 1;
          if (data.length) okRows.push(...data);
        } catch (error) {
          fail += 1;
          failures.push({ underlying: job.stored, yahoo: job.yahoo, error: errorText(error) });
        }
      }
    }),
  );

  let writeError = null;
  if (!DRY && okRows.length > 0) {
    for (let offset = 0; offset < okRows.length; offset += UPSERT) {
      const batch = okRows.slice(offset, offset + UPSERT);
      const { error } = await db.from("underlying_prices").upsert(batch, { onConflict: "underlying,date" });
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
    fail,
    rows: okRows.length,
    dry: DRY,
    onlyMissing: ONLY,
    failures,
  };
  if (writeError) summary.writeError = writeError;
  console.log(JSON.stringify(summary));
  // Catálogo vacío o todo el lote fallido: el workflow falla. Cero pendientes (--only-missing) no.
  if (writeError || catalog.length === 0 || (jobs.length > 0 && ok === 0)) process.exit(1);
} catch (error) {
  console.error(errorText(error));
  process.exit(1);
}

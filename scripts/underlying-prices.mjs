// node scripts/underlying-prices.mjs [--days 365] [--incremental-days 10] [--workers 8] [--dry-run]
// Tope: 365 días aunque se pida más. ALL del gráfico equivale a 1 año.
import { createClient } from "@supabase/supabase-js";
import { GENERATED_TICKERS } from "../config/tickers.generated.ts";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) =>
      a.startsWith("--")
        ? [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]
        : [],
    )
    .filter(Boolean),
);
const DAYS = Math.min(365, Number(args.days ?? 365));
const INC = Number(args["incremental-days"] ?? 10);
const WORKERS = Number(args.workers ?? 8);
const DRY = Boolean(args["dry-run"]);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const yahoo = (u) => u.trim().toUpperCase().replace(/\./g, "-"); // = lib/market/underlying-move.ts

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const symbols = [
  ...new Set(GENERATED_TICKERS.filter((t) => t.enabled && t.underlying).map((t) => yahoo(t.underlying))),
];

// Incremental: quien ya tiene cierre en los últimos 7 días baja solo INC días.
const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
const { data: recent } = await db.from("underlying_prices").select("underlying").gte("date", since);
const fresh = new Set((recent ?? []).map((r) => r.underlying));

async function fetchEod(sym, days, attempt = 1) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${days}d&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1500 * attempt));
    return fetchEod(sym, days, attempt + 1);
  }
  if (!res.ok) throw new Error(`${sym} HTTP ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const close = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
  const tz = r?.meta?.exchangeTimezoneName ?? "America/New_York";
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  return ts
    .map((t, i) => ({ underlying: sym, date: fmt.format(new Date(t * 1000)), close: Number(close[i]), source: "yahoo" }))
    .filter((row) => Number.isFinite(row.close) && row.close > 0);
}

let ok = 0;
let fail = 0;
let rows = 0;
const queue = [...symbols];
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    for (let sym; (sym = queue.shift()); ) {
      try {
        const data = await fetchEod(sym, fresh.has(sym) && INC > 0 ? INC : DAYS);
        if (!DRY && data.length) {
          const { error } = await db.from("underlying_prices").upsert(data, { onConflict: "underlying,date" });
          if (error) throw error;
        }
        ok++;
        rows += data.length;
      } catch (e) {
        fail++;
        console.warn("FALLO", sym, String(e));
      }
    }
  }),
);
console.log(JSON.stringify({ symbols: symbols.length, ok, fail, rows, dry: DRY }));
if (ok === 0) process.exit(1); // si todo falla, el workflow falla y avisa

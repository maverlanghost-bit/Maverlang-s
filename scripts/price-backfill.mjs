/**
 * Llena `public.price_ticks` una vez, igual que los crons diarios:
 * historia de CoinGecko y spot de Jupiter para cada activo visible.
 *
 *   node scripts/price-backfill.mjs [--dry-run]
 *   node scripts/price-backfill.mjs --confirm-project <ref>
 *
 * Node 22.15+ (este repo pide >=22; acá se usa registerHooks para los .ts).
 *
 * Lee NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY del entorno
 * (o de .env.local, sin pisar lo que ya esté definido). No imprime
 * secretos ni precios. Sólo escribe en price_ticks.
 * --dry-run pide las cotizaciones y no toca la base.
 */
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { ensureProjectConfirmed } from "./project-guard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY_RUN = process.argv.includes("--dry-run");
const ASSET_PAGE = 1000;
const ASSET_MAX_PAGES = 20;
const ASSET_COLUMNS = [
  "symbol",
  "mint_solana",
  "issuer",
  "safety_status",
  "curated",
  "enabled",
  "is_trading_halted",
  "company_ticker",
  "underlying",
  "safety_metrics",
].join(",");

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    if (relative && path.extname(specifier) === "") {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

function loadLocalEnv() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file) || typeof process.loadEnvFile !== "function") return;
  try {
    process.loadEnvFile(file);
  } catch {
    // Sin .env.local usable: se avisa por las variables que falten.
  }
}

function scrub(text) {
  let out = text;
  for (const name of [
    "SUPABASE_SECRET_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "COINGECKO_API_KEY",
    "JUPITER_API_KEY",
  ]) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) out = out.split(value).join("[secret]");
  }
  return out;
}

function finish(summary) {
  console.log(JSON.stringify(summary));
  if (!summary.ok) process.exit(1);
}

function confirmProject(targetUrl) {
  const previous = console.log;
  console.log = (...args) => {
    console.error(...args);
  };
  try {
    ensureProjectConfirmed({ targetUrl, script: "price-backfill" });
  } finally {
    console.log = previous;
  }
}

async function main() {
  loadLocalEnv();
  const { safeJobError } = await import("../lib/market/cron-safe.ts");
  const missing = [];
  if (!(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim()) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!(process.env.SUPABASE_SECRET_KEY ?? "").trim()) missing.push("SUPABASE_SECRET_KEY");
  if (missing.length > 0) {
    finish({ ok: false, error: "missing_env", missing, dryRun: DRY_RUN });
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
  const secret = process.env.SUPABASE_SECRET_KEY.trim();
  const { selectVisiblePriceAssets } = await import("../lib/market/cron-visible.ts");
  const { runJupiterTickJob, runCoinGeckoBackfillJob } = await import("../lib/market/price-cron-job.ts");
  const { ONDO_TICKERS } = await import("../config/ondo.generated.ts");

  const volumeWinners = new Map();
  for (const entry of ONDO_TICKERS) {
    if (entry.volumeWinner === "xstocks" || entry.volumeWinner === "ondo") {
      volumeWinners.set(entry.ticker, entry.volumeWinner);
    }
  }

  const supabase = createClient(supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const rows = [];
  for (let page = 0; page < ASSET_MAX_PAGES; page += 1) {
    const from = page * ASSET_PAGE;
    const { data, error } = await supabase
      .from("assets")
      .select(ASSET_COLUMNS)
      .order("symbol", { ascending: true })
      .range(from, from + ASSET_PAGE - 1);
    if (error) {
      finish({
        ok: false,
        error: "assets_read",
        dbError: scrub(safeJobError(error)),
        dryRun: DRY_RUN,
        visible: 0,
        wrote: false,
      });
      return;
    }
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < ASSET_PAGE) break;
  }

  // Igual que el cron: `searchCatalog` sin alcance pedido usa `curated` si
  // esa es la variable, y `listed` en cualquier otro caso (también si es `all`).
  const visibleAssets = selectVisiblePriceAssets(rows, {
    scope: process.env.CATALOG_SCOPE === "curated" ? "curated" : "listed",
    production: process.env.NODE_ENV === "production",
    fromSupabase: true,
    volumeWinners,
  });
  console.error(`[price-backfill] visibles ${visibleAssets.length}${DRY_RUN ? " (dry-run)" : ""}`);

  if (!DRY_RUN && visibleAssets.length > 0) confirmProject(supabaseUrl);

  const apiKey = (process.env.COINGECKO_API_KEY ?? "").trim();
  let recorded = 0;
  let quoted = 0;
  /** @type {string | null} */
  let jupiterError = null;
  let jupiterLimited = false;
  /** @type {string | null} */
  let geckoError = null;
  let backfilled = 0;
  let points = 0;
  let noId = 0;
  let geckoLimited = false;
  let remaining = 0;
  let idMap = 0;
  let pending = 0;

  async function persist(ticks) {
    if (DRY_RUN) return { saved: ticks.length, error: null };
    const payload = ticks.map((tick) => ({
      symbol: tick.symbol,
      t: new Date(tick.t).toISOString(),
      price_usd: tick.priceUsd,
      source: tick.source,
    }));
    const { error } = await supabase.from("price_ticks").upsert(payload, {
      onConflict: "symbol,t,source",
      ignoreDuplicates: true,
    });
    if (error) return { saved: 0, error: scrub(safeJobError(error)) };
    return { saved: payload.length, error: null };
  }

  if (visibleAssets.length > 0) {
    const jupiter = await runJupiterTickJob({
      assets: visibleAssets,
      priceUrl: process.env.JUPITER_BASE_URL || "https://api.jup.ag",
      apiKey: process.env.JUPITER_API_KEY,
      write: async (ticks) => {
        const written = await persist(ticks);
        if (!written.error) recorded += written.saved;
        return written;
      },
    });
    quoted = jupiter.quoted;
    jupiterError = jupiter.dbError;
    jupiterLimited = jupiter.rateLimited;
    console.error(`[price-backfill] jupiter cotizados ${quoted}`);

    const gecko = await runCoinGeckoBackfillJob({
      assets: visibleAssets,
      apiKey,
      days: 365,
      cap: visibleAssets.length,
      paceMs: apiKey ? 250 : 1_100,
      idMapRetries: 2,
      retry429: 4,
      hasHistory: async (symbols) => {
        const found = new Set();
        await Promise.all(
          symbols.map(async (symbol) => {
            const { data, error } = await supabase
              .from("price_ticks")
              .select("symbol")
              .eq("symbol", symbol)
              .eq("source", "coingecko")
              .limit(1);
            if (error) throw new Error(scrub(safeJobError(error)));
            if (Array.isArray(data) && data.length > 0) found.add(symbol);
          }),
        );
        return found;
      },
      write: async (ticks) => {
        for (let index = 0; index < ticks.length; index += 400) {
          const written = await persist(ticks.slice(index, index + 400));
          if (written.error) return written;
        }
        return { saved: ticks.length, error: null };
      },
    });
    backfilled = gecko.backfilled;
    points = gecko.points;
    noId = gecko.noId;
    geckoError = gecko.dbError;
    geckoLimited = gecko.rateLimited;
    remaining = gecko.remaining;
    idMap = gecko.idMap;
    pending = gecko.pending;
    console.error(`[price-backfill] coingecko id ${idMap} nuevos ${backfilled} sin id ${noId}`);
  }

  const dbError = jupiterError || geckoError;
  let ok = !dbError;
  if (visibleAssets.length > 0 && quoted === 0) ok = false;
  if (visibleAssets.length > 0 && idMap === 0) ok = false;
  finish({
    ok,
    dryRun: DRY_RUN,
    visible: visibleAssets.length,
    wrote: !DRY_RUN && !dbError && (recorded > 0 || points > 0),
    jupiter: { candidates: visibleAssets.length, quoted, recorded, rateLimited: jupiterLimited, dbError: jupiterError },
    coingecko: {
      backfilled,
      pending,
      points,
      noId,
      rateLimited: geckoLimited,
      dbError: geckoError,
      remaining,
      idMap,
    },
  });
}

main().catch(async (error) => {
  let message = "failed";
  try {
    const { safeJobError } = await import("../lib/market/cron-safe.ts");
    message = scrub(safeJobError(error));
  } catch {
    message = "failed";
  }
  console.log(JSON.stringify({ ok: false, error: "failed", message }));
  process.exit(1);
});

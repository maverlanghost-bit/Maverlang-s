/**
 * Sincroniza el catálogo xStocks (M37).
 * - Pagina la API pública (pageSize 100, mientras hasNextPage), sólo con deployment Solana.
 * - Liquidez Jupiter en lotes (pausa + reintento ante 429; si falla usa el CSV).
 * - Marca curated según data/curated-symbols.json (fuente única).
 * - Descarga UNA vez el logo curado a public/logos/<slug>.png si no existe.
 * - Upsert en public.assets con la secret key (nunca imprime claves).
 * - Genera config/tickers.generated.ts (sin liquidez ni campos diarios).
 *
 * Uso:
 *   node scripts/sync-xstocks.mjs [--dry-run] [--no-db] [--no-files]
 *   npm run sync:xstocks
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { ensureProjectConfirmed } from "./project-guard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARGS = new Set(process.argv.slice(2));
const DRY_RUN = ARGS.has("--dry-run");
const NO_DB = ARGS.has("--no-db");
const NO_FILES = ARGS.has("--no-files");

const XSTOCKS_BASE = "https://api.xstocks.fi/api/v2/public/assets";
const JUP_BASE = "https://lite-api.jup.ag/tokens/v2/search";
const LOGO_SOURCE = "https://xstocks-metadata.backed.fi/logos/tokens";
const CSV_PATH = path.join(ROOT, "data", "xstocks-solana-2026-10-06.csv");
const CURATED_PATH = path.join(ROOT, "data", "curated-symbols.json");
const LOGOS_DIR = path.join(ROOT, "public", "logos");
const GENERATED_PATH = path.join(ROOT, "config", "tickers.generated.ts");

function loadLocalEnv() {
  const file = path.join(ROOT, ".env.local");
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(file);
      return;
    } catch {
      // Sigue sin .env.local (ej. CI): la parte de DB avisará.
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, ms = 20_000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchJsonRetry(url, { tries = 3, waitMs = 1500, label = "http" } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.status === 429 && attempt < tries) {
        await sleep(waitMs * attempt);
        continue;
      }
      if (!res.ok) throw new Error(`${label} http ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < tries) await sleep(waitMs * attempt);
    }
  }
  throw lastError ?? new Error(`${label} sin respuesta`);
}

function text(value) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function solanaMint(node) {
  const list = node?.deployments;
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    if (item.network !== "Solana") continue;
    const address = text(item.address);
    if (address) return address;
  }
  return null;
}

function displayName(name, symbol, underlying) {
  const raw = text(name) ?? symbol;
  const clean = raw.replace(/\s+xStocks?$/i, "").trim();
  if (clean.length > 0) return clean;
  if (text(underlying)) return underlying.trim();
  return symbol;
}

function safeLogoFileName(value) {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug.length > 0 ? slug : "token"}.png`;
}

function parseNode(node) {
  const symbol = text(node?.symbol);
  if (!symbol) return null;
  const underlyingObj =
    typeof node?.underlying === "object" && node?.underlying !== null ? node.underlying : null;
  const exchange =
    underlyingObj && typeof underlyingObj.exchange === "object" && underlyingObj.exchange !== null
      ? underlyingObj.exchange
      : null;
  const underlying =
    text(node?.underlyingSymbol) ?? text(underlyingObj?.symbol) ?? symbol.replace(/x$/i, "");
  const trading =
    typeof node?.trading === "object" && node?.trading !== null ? node.trading : null;
  const halted =
    (typeof node?.isTradingHalted === "boolean" ? node.isTradingHalted : false) ||
    (trading && typeof trading.isTradingHalted === "boolean" ? trading.isTradingHalted : false);
  const openRaw = trading?.openNow;
  return {
    xstocksId: text(node?.id),
    symbol,
    name: displayName(node?.name, symbol, underlying),
    underlying,
    underlyingCurrency: text(underlyingObj?.currency) ?? "USD",
    isin: text(node?.isin),
    underlyingIsin: text(node?.underlyingIsin) ?? text(underlyingObj?.isin),
    exchangeMic: exchange ? text(exchange.mic) : null,
    exchangeName: exchange ? text(exchange.name) : null,
    exchangeTimezone: exchange ? text(exchange.timezone) : null,
    mintSolana: solanaMint(node),
    logoUrl: text(node?.logo),
    tradingHoursMode: text(trading?.tradingHoursMode),
    isTradingHalted: halted,
    currentPeriod: text(trading?.currentPeriod),
    openNow: typeof openRaw === "boolean" ? openRaw : null,
    nextChangeAt: text(trading?.nextChangeAt),
    limits: trading?.limitsPerPeriod ?? null,
    raw: node,
  };
}

function readCurated() {
  const raw = JSON.parse(readFileSync(CURATED_PATH, "utf8"));
  const list = Array.isArray(raw.symbols) ? raw.symbols : [];
  const map = new Map();
  for (const item of list) {
    if (item && typeof item.symbol === "string" && typeof item.category === "string") {
      map.set(item.symbol, item.category);
    }
  }
  return map;
}

function readCsvLiquidity() {
  const out = new Map();
  const meta = new Map();
  if (!existsSync(CSV_PATH)) return { out, meta };
  const raw = readFileSync(CSV_PATH, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (const line of lines.slice(1)) {
    const cols = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    if (cols.length < 9) continue;
    const [symbol, name, underlying, currency, mint, logo, mode, halted, liq] = cols;
    if (symbol) {
      const value = Number(liq);
      out.set(symbol, Number.isFinite(value) ? value : 0);
      meta.set(symbol, { name, underlying, currency, mint, logo, mode, halted: halted === "true" });
    }
  }
  return { out, meta };
}

async function fetchAllAssets() {
  const nodes = [];
  let page = 1;
  for (;;) {
    const url = `${XSTOCKS_BASE}?network=Solana&page=${page}&pageSize=100`;
    const data = await fetchJsonRetry(url, { label: `xstocks p${page}` });
    const batch = Array.isArray(data?.nodes) ? data.nodes : [];
    nodes.push(...batch);
    const hasNext = data?.page?.hasNextPage === true;
    if (!hasNext) break;
    page += 1;
    await sleep(400);
    if (page > 30) break;
  }
  return nodes;
}

async function fetchJupiterLiquidity(mints) {
  const out = new Map();
  const unique = [...new Set(mints.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const url = `${JUP_BASE}?query=${encodeURIComponent(batch.join(","))}`;
    try {
      const data = await fetchJsonRetry(url, { tries: 3, waitMs: 3000, label: "jupiter" });
      const list = Array.isArray(data) ? data : Array.isArray(data?.tokens) ? data.tokens : [];
      for (const token of list) {
        const id = text(token?.id) ?? text(token?.mint) ?? text(token?.address);
        const liq = Number(token?.liquidity);
        if (id) out.set(id, Number.isFinite(liq) ? liq : 0);
      }
    } catch {
      // Se deja vacío: el llamador usa el CSV como respaldo.
      return { map: out, ok: false };
    }
    await sleep(1200);
  }
  return { map: out, ok: true };
}

async function downloadLogoOnce(symbol, underlying, logoUrl) {
  const file = safeLogoFileName(underlying);
  const dest = path.join(LOGOS_DIR, file);
  if (existsSync(dest)) return { symbol, skipped: true, file };
  const candidates = [];
  if (logoUrl) candidates.push(logoUrl);
  candidates.push(`${LOGO_SOURCE}/${symbol}.png`);
  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url);
      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      const bytes = Buffer.from(await res.arrayBuffer());
      if (res.status === 200 && type.startsWith("image/") && bytes.length > 0) {
        if (!DRY_RUN && !NO_FILES) {
          mkdirSync(LOGOS_DIR, { recursive: true });
          writeFileSync(dest, bytes);
        }
        return { symbol, skipped: false, file, bytes: bytes.length };
      }
    } catch {
      // Prueba el siguiente candidato.
    }
  }
  return { symbol, skipped: false, file, failed: true };
}

function buildGenerated(curatedRows) {
  const sorted = [...curatedRows].sort((a, b) => {
    if (a.category < b.category) return -1;
    if (a.category > b.category) return 1;
    return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  });
  const lines = [];
  lines.push("// Archivo generado por scripts/sync-xstocks.mjs; no editar a mano.");
  lines.push('import type { Ticker } from "@/lib/types";');
  lines.push("");
  lines.push("export interface GeneratedTicker extends Ticker {");
  lines.push("  tradingHoursMode: string;");
  lines.push("}");
  lines.push("");
  lines.push("const base = { decimals: 8 as const, issuer: \"Backed (xStocks)\" as const };");
  lines.push("");
  lines.push("export const GENERATED_TICKERS: GeneratedTicker[] = [");
  for (const row of sorted) {
    const safe = (v) => JSON.stringify(v);
    lines.push(
      `  { ...base, symbol: ${safe(row.symbol)}, underlying: ${safe(row.underlying)}, name: ${safe(row.name)}, category: ${safe(row.category)}, mint: ${safe(row.mint)}, logo: ${safe(row.logoPath)}, enabled: ${row.enabled ? "true" : "false"}, tradingHoursMode: ${safe(row.tradingHoursMode ?? "TwentyFourFive")} },`,
    );
  }
  lines.push("];");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  loadLocalEnv();
  const curatedMap = readCurated();
  const csv = readCsvLiquidity();

  console.log(`Curados configurados: ${curatedMap.size}`);
  let nodes = [];
  try {
    nodes = await fetchAllAssets();
  } catch (error) {
    console.error(`FALLO xstocks API: ${error instanceof Error ? error.message : error}`);
    console.error("Sigo con el CSV como respaldo.");
  }
  const total = nodes.length;
  const parsed = nodes.map(parseNode).filter(Boolean);
  const withSolana = parsed.filter((p) => p.mintSolana);

  // Si la API falló, respalda con el CSV (sólo mint/nombre base).
  let working = withSolana;
  if (working.length === 0 && csv.meta.size > 0) {
    working = [...csv.meta.entries()].map(([symbol, m]) => ({
      xstocksId: null,
      symbol,
      name: displayName(m.name, symbol, m.underlying),
      underlying: m.underlying || symbol.replace(/x$/i, ""),
      underlyingCurrency: m.currency || "USD",
      isin: null,
      underlyingIsin: null,
      exchangeMic: null,
      exchangeName: null,
      exchangeTimezone: null,
      mintSolana: m.mint || null,
      logoUrl: m.logo || null,
      tradingHoursMode: m.mode || "TwentyFourFive",
      isTradingHalted: m.halted,
      currentPeriod: null,
      openNow: null,
      nextChangeAt: null,
      limits: null,
      raw: null,
    }));
  }

  const bySymbol = new Map(working.map((p) => [p.symbol, p]));
  const curatedRows = [];
  for (const [symbol, category] of curatedMap) {
    const found = bySymbol.get(symbol) ?? null;
    const csvMeta = csv.meta.get(symbol);
    const mint = found?.mintSolana ?? csvMeta?.mint ?? null;
    const name = found?.name ?? (csvMeta ? displayName(csvMeta.name, symbol, csvMeta.underlying) : symbol);
    const underlying = found?.underlying ?? csvMeta?.underlying ?? symbol.replace(/x$/i, "");
    const mode = found?.tradingHoursMode ?? csvMeta?.mode ?? "TwentyFourFive";
    const halted = found?.isTradingHalted ?? csvMeta?.halted ?? false;
    curatedRows.push({
      symbol,
      underlying,
      name,
      category,
      mint,
      logoPath: `/logos/${safeLogoFileName(underlying)}`,
      logoUrl: found?.logoUrl ?? csvMeta?.logo ?? `${LOGO_SOURCE}/${symbol}.png`,
      enabled: !halted,
      tradingHoursMode: mode,
      parsed: found,
    });
  }

  // Liquidez Jupiter (sólo para ordenar/informar; no entra al generado).
  const mints = working.map((p) => p.mintSolana).filter(Boolean);
  const jup = await fetchJupiterLiquidity(mints);
  const liquidity = new Map();
  if (jup.ok) {
    for (const [k, v] of jup.map) liquidity.set(k, v);
    console.log(`Jupiter: liquidez ok (${jup.map.size} mints)`);
  } else {
    console.log("Jupiter falló o devolvió 429: uso la columna jupiter_liquidity_usd del CSV.");
    for (const [symbol, value] of csv.out) {
      const row = bySymbol.get(symbol) ?? csv.meta.get(symbol);
      const mint = row?.mintSolana ?? row?.mint;
      if (mint) liquidity.set(mint, value);
    }
  }

  // Logos (sólo curados, sólo si falta el archivo).
  let logosOk = 0;
  let logosSkipped = 0;
  const logoErrors = [];
  if (!NO_FILES) {
    for (const row of curatedRows) {
      const result = await downloadLogoOnce(row.symbol, row.underlying, row.logoUrl);
      if (result.failed) {
        logoErrors.push(row.symbol);
        console.error(`FALLO logo ${row.symbol}`);
      } else if (result.skipped) {
        logosSkipped += 1;
      } else {
        logosOk += 1;
        console.log(`ok logo ${row.symbol} -> public/logos/${result.file}`);
      }
    }
  }

  // Archivo generado (sin liquidez).
  let generatedWritten = false;
  const missingMint = curatedRows.filter((r) => !r.mint).map((r) => r.symbol);
  if (missingMint.length > 0) {
    console.error(`Sin mint para: ${missingMint.join(", ")} (no se genera el archivo)`);
  } else if (!NO_FILES) {
    const content = buildGenerated(curatedRows);
    if (!DRY_RUN) {
      writeFileSync(GENERATED_PATH, content, "utf8");
      generatedWritten = true;
    }
    console.log(`Generado: config/tickers.generated.ts (${curatedRows.length} curados)`);
  }

  // DB (upsert). Si la tabla no existe, avisa y sigue.
  let upserted = 0;
  const dbErrors = [];
  if (!NO_DB && !DRY_RUN) {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
    const secret = (
      process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      ""
    ).trim();
    if (!url || !secret) {
      console.log("Sin claves Supabase en .env.local: salto la DB (aplica 0004 y configura el env).");
    } else {
      // M46: imprime el proyecto destino (sólo el ref) y, si no es el de
      // desarrollo, exige --confirm-project <ref>.
      ensureProjectConfirmed({ targetUrl: url, script: "sync-xstocks" });
      const admin = createClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      // Sonda: si la tabla no existe, PostgREST responde PGRST205 o 42P01.
      const probe = await admin.from("assets").select("symbol").limit(1);
      if (probe.error && /does not exist|schema cache|could not find/i.test(probe.error.message ?? "")) {
        console.log("tabla assets no existe: aplica 0004");
      } else if (probe.error) {
        console.error(`DB sonda falló: ${probe.error.message}`);
        dbErrors.push("sonda");
      } else {
        const rows = working.map((p) => {
          const isCurated = curatedMap.has(p.symbol);
          const liq = p.mintSolana ? (liquidity.get(p.mintSolana) ?? csv.out.get(p.symbol) ?? null) : null;
          return {
            symbol: p.symbol,
            xstocks_id: p.xstocksId,
            name: p.name,
            underlying: p.underlying,
            underlying_currency: p.underlyingCurrency,
            isin: p.isin,
            underlying_isin: p.underlyingIsin,
            exchange_mic: p.exchangeMic,
            exchange_name: p.exchangeName,
            exchange_timezone: p.exchangeTimezone,
            mint_solana: p.mintSolana,
            logo_url: p.logoUrl,
            logo_path: `/logos/${safeLogoFileName(p.underlying)}`,
            category: curatedMap.get(p.symbol) ?? null,
            trading_hours_mode: p.tradingHoursMode,
            is_trading_halted: p.isTradingHalted,
            current_period: p.currentPeriod,
            open_now: p.openNow,
            next_change_at: p.nextChangeAt,
            limits: p.limits,
            jupiter_liquidity_usd: liq,
            curated: isCurated,
            enabled: isCurated ? !p.isTradingHalted : true,
            raw: p.raw,
            synced_at: new Date().toISOString(),
          };
        });
        for (let i = 0; i < rows.length; i += 200) {
          const batch = rows.slice(i, i + 200);
          const res = await admin.from("assets").upsert(batch, { onConflict: "symbol" });
          if (res.error) {
            if (/does not exist|schema cache|could not find/i.test(res.error.message ?? "")) {
              console.log("tabla assets no existe: aplica 0004");
              break;
            }
            console.error(`DB upsert falló: ${res.error.message}`);
            dbErrors.push(`lote-${i}`);
            break;
          }
          upserted += batch.length;
        }
      }
    }
  } else {
    console.log("DB omitida (--no-db, --dry-run o --no-files según flags).");
  }

  if (DRY_RUN) {
    console.log("dry-run: no se escribió nada (ni logos, ni generado, ni DB).");
  }

  console.log(
    `Resumen: total=${total} conSolana=${withSolana.length} curados=${curatedRows.length} logosBajados=${logosOk} logosExistentes=${logosSkipped} filasUpsert=${upserted} errores=${logoErrors.length + dbErrors.length}`,
  );
  if (logoErrors.length > 0) console.log(`Logos con fallo: ${logoErrors.join(", ")}`);
  if (!generatedWritten && !NO_FILES && !DRY_RUN && missingMint.length === 0) {
    console.log("Aviso: el archivo generado no se escribió.");
  }
}

await main();

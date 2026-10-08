/**
 * Semilla de Ondo Stocks en Solana, segundo emisor del catálogo (M52b).
 * Fuente ÚNICA de mints Ondo: data/ondo/ondo-vs-xstocks-2026-10-07.csv
 * (no inventa ni busca mints en otra parte). Genera, en orden estable:
 * - config/ondo.generated.ts (snapshot commiteable para la app)
 * - supabase/migrations/0022_ondo_issuer.sql (migración, NO la aplica)
 *
 * Uso:
 *   node scripts/gen-ondo-seed.mjs
 *
 * Reglas de inclusión (del prompt M52b):
 * - Entran TODAS las filas con mint Ondo (el volumen 24h NO excluye).
 * - EXCLUIDAS: ETF apalancados o inversos (ganador = excluir y además
 *   classifyProduct(...) === "leveraged"), `AIon` (decisión de Manu/Capataz),
 *   `USDon`, los Portfolio y todo lo que no tenga mint de Solana.
 * - Las filas ganador = xstocks o ninguno también cargan su Ondo (en watch);
 *   la columna ganador se guarda solo como desempate (volumeWinner).
 *
 * Conteos esperados del CSV: 444 agregados, 212 donde Ondo gana por volumen
 * a xStocks (categoria=ambos), 192 solo-Ondo, 6 excluidos (TQQQ, SOXL, SOXS,
 * SQQQ, PSQ y AIon). Si no cuadran, sale con código 1.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyProduct } from "../lib/catalog/safety-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV_PATH = path.join(ROOT, "data", "ondo", "ondo-vs-xstocks-2026-10-07.csv");
const GENERATED_PATH = path.join(ROOT, "config", "ondo.generated.ts");
const MIGRATION_PATH = path.join(ROOT, "supabase", "migrations", "0022_ondo_issuer.sql");

/** Tickers del subyacente que nunca entran (decisión de Manu/Capataz + defensa). */
export const EXCLUDED_COMPANY_TICKERS = Object.freeze(["AI", "USD"]);

/** Símbolos Ondo excluidos (para el registro y los tests). */
export const EXCLUDED_ONDO_SYMBOLS = Object.freeze(["AIon", "PSQon", "SQQQon", "SOXLon", "SOXSon", "TQQQon"]);

export const EXPECTED_COUNTS = Object.freeze({
  included: 444,
  ondoWinsBoth: 212,
  onlyOndo: 192,
  excluded: 6,
});

/**
 * Parser CSV mínimo (comillas dobles + comas dentro de comillas).
 * @param {string} text contenido del CSV
 * @returns {{ header: string[], rows: string[][] }}
 */
export function parseOndoCsv(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim().length === 0) continue;
    const cols = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < raw.length; i += 1) {
      const char = raw[i];
      if (quoted) {
        if (char === '"') {
          if (raw[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else {
            quoted = false;
          }
        } else {
          cur += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        cols.push(cur);
        cur = "";
      } else {
        cur += char;
      }
    }
    cols.push(cur);
    out.push(cols);
  }
  const [header, ...rows] = out;
  return { header: header ?? [], rows };
}

/**
 * @param {string} winner valor crudo de la columna ganador
 * @returns {"xstocks" | "ondo" | null} ganador por volumen (desempate)
 */
export function normalizeVolumeWinner(winner) {
  const raw = typeof winner === "string" ? winner.trim().toLowerCase() : "";
  if (raw === "xstocks") return "xstocks";
  if (raw === "ondo" || raw.startsWith("ondo ")) return "ondo";
  return null;
}

/**
 * Clasifica las filas del CSV en incluidas/excluidas (puro, testeable).
 * @param {string[][]} rows filas sin header
 * @param {string[]} header columnas
 */
export function buildOndoSeed(rows, header) {
  const at = (name) => header.indexOf(name);
  const ti = at("ticker");
  const ei = at("empresa");
  const mi = at("mint_ondo");
  const gi = at("ganador");
  const ci = at("categoria");
  const pi = at("tipo");
  /** @type {Array<{ ticker: string, name: string, mint: string, kind: string, winner: string, volumeWinner: string | null, category: string }>} */
  const included = [];
  /** @type {Array<{ ticker: string, reason: string }>} */
  const excluded = [];
  for (const cols of rows) {
    const ticker = (cols[ti] ?? "").trim();
    const name = (cols[ei] ?? "").trim();
    const mint = (cols[mi] ?? "").trim();
    const winner = (cols[gi] ?? "").trim();
    const category = (cols[ci] ?? "").trim();
    const tipo = (cols[pi] ?? "").trim();
    if (!ticker) {
      excluded.push({ ticker: "(sin ticker)", reason: "sin_ticker" });
      continue;
    }
    if (!mint) {
      excluded.push({ ticker, reason: "sin_mint_solana" });
      continue;
    }
    if (EXCLUDED_COMPANY_TICKERS.includes(ticker)) {
      excluded.push({ ticker, reason: "excluido_por_decision" });
      continue;
    }
    const kind = tipo === "ETF" ? "etf" : tipo === "Stock" ? "stock" : null;
    if (!kind) {
      excluded.push({ ticker, reason: "tipo_no_stock_ni_etf" });
      continue;
    }
    const micHint = kind === "etf" ? "ARCX" : "XNAS";
    if (winner === "excluir" && classifyProduct(name, micHint) === "leveraged") {
      excluded.push({ ticker, reason: "etf_apalancado_o_inverso" });
      continue;
    }
    included.push({
      ticker,
      name: name || ticker,
      mint,
      kind,
      winner,
      volumeWinner: normalizeVolumeWinner(winner),
      category,
    });
  }
  included.sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
  const ondoWinsBoth = included.filter((row) => row.category === "ambos" && row.volumeWinner === "ondo").length;
  const onlyOndo = included.filter((row) => row.winner.trim().toLowerCase() === "ondo (solo ondo)").length;
  return { included, excluded, counts: { included: included.length, ondoWinsBoth, onlyOndo, excluded: excluded.length } };
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildGeneratedTs(seed) {
  const lines = [];
  lines.push("// Snapshot de Ondo Stocks en Solana, generado por scripts/gen-ondo-seed.mjs; no editar a mano.");
  lines.push("// Fuente única de mints Ondo: data/ondo/ondo-vs-xstocks-2026-10-07.csv.");
  lines.push("// Símbolo `<TICKER>on`. Entran en `watch` (migración 0022, sin aplicar).");
  lines.push("");
  lines.push("export interface OndoEntry {");
  lines.push("  /** Símbolo en el catálogo (`<TICKER>on`). */");
  lines.push("  symbol: string;");
  lines.push("  /** Ticker del subyacente (agrupa por empresa: `company_ticker`). */");
  lines.push("  ticker: string;");
  lines.push("  name: string;");
  lines.push("  /** Mint en Solana (registro oficial de Ondo, vía el CSV). */");
  lines.push("  mint: string;");
  lines.push('  kind: "stock" | "etf";');
  lines.push("  /** Columna `ganador` del CSV: sólo desempate por volumen. */");
  lines.push("  winner: string;");
  lines.push('  volumeWinner: "xstocks" | "ondo" | null;');
  lines.push("}");
  lines.push("");
  lines.push("export const ONDO_TICKERS: OndoEntry[] = [");
  for (const row of seed.included) {
    const safe = (v) => JSON.stringify(v);
    lines.push(
      `  { symbol: ${safe(`${row.ticker}on`)}, ticker: ${safe(row.ticker)}, name: ${safe(row.name)}, mint: ${safe(row.mint)}, kind: ${safe(row.kind)}, winner: ${safe(row.winner)}, volumeWinner: ${row.volumeWinner === null ? "null" : safe(row.volumeWinner)} },`,
    );
  }
  lines.push("];");
  lines.push("");
  lines.push("export const ONDO_MINTS: Set<string> = new Set(ONDO_TICKERS.map((entry) => entry.mint));");
  lines.push("");
  lines.push("export const ONDO_BY_MINT: Map<string, OndoEntry> = new Map(ONDO_TICKERS.map((entry) => [entry.mint, entry]));");
  lines.push("");
  lines.push(
    "export const ONDO_BY_SYMBOL: Map<string, OndoEntry> = new Map(ONDO_TICKERS.map((entry) => [entry.symbol.toLowerCase(), entry]));",
  );
  lines.push("");
  lines.push(`export const ONDO_EXCLUDED_SYMBOLS: readonly string[] = ${JSON.stringify([...EXCLUDED_ONDO_SYMBOLS])};`);
  lines.push("");
  lines.push(
    `export const ONDO_COUNTS = ${JSON.stringify(seed.counts)} as const;`,
  );
  lines.push("");
  return `${lines.join("\n")}`;
}

function buildMigrationSql(seed) {
  const lines = [];
  lines.push("-- Maverlang — Ondo Stocks como segundo emisor del catálogo (M52b).");
  lines.push("-- NO APLICADA todavía: la aplica el operador cuando Manu autorice, DESPUÉS de 0021.");
  lines.push("-- Pegar UNA vez en el SQL Editor DESPUÉS de 0021_*.sql.");
  lines.push("-- Idempotente: se puede volver a ejecutar (add column if not exists,");
  lines.push("-- drop constraint if exists + add constraint, create index if not exists,");
  lines.push("-- update sólo de nulos, insert on conflict do nothing).");
  lines.push("-- Sin pg_catalog.current_date, sin tocar 0001_init.sql.");
  lines.push("-- Todas las filas Ondo entran en `watch`: se ven con \"En revisión\", no se");
  lines.push("-- operan; pasan a `listed` solas por la histéresis de nextSafetyState.");
  lines.push("");
  lines.push("-- 1. Emisor por fila: `xstocks` (Backed) u `ondo` (Ondo Stocks).");
  lines.push("alter table public.assets");
  lines.push("  add column if not exists issuer text not null default 'xstocks';");
  lines.push("alter table public.assets drop constraint if exists assets_issuer_check;");
  lines.push("alter table public.assets");
  lines.push("  add constraint assets_issuer_check check (issuer in ('xstocks', 'ondo'));");
  lines.push("");
  lines.push("-- 2. Ticker del subyacente, para agrupar una ficha por empresa.");
  lines.push("alter table public.assets");
  lines.push("  add column if not exists company_ticker text;");
  lines.push("");
  lines.push("create index if not exists assets_company_ticker_idx");
  lines.push("  on public.assets (company_ticker);");
  lines.push("");
  lines.push("-- 3. Rellena company_ticker de las filas xStocks existentes (underlying = ticker).");
  lines.push("update public.assets");
  lines.push("  set company_ticker = underlying");
  lines.push("  where company_ticker is null and underlying is not null;");
  lines.push("");
  lines.push(`-- 4. Filas Ondo (${seed.included.length}): watch, no curadas, contadores en 0.`);
  for (const row of seed.included) {
    const symbol = `${row.ticker}on`;
    const category = row.kind === "etf" ? "etf" : "other";
    lines.push(
      `insert into public.assets (symbol, name, underlying, mint_solana, logo_path, category, issuer, company_ticker, curated, enabled, safety_status, safety_reasons, consecutive_passes, consecutive_fails) values (${sqlString(symbol)}, ${sqlString(row.name)}, ${sqlString(row.ticker)}, ${sqlString(row.mint)}, null, ${sqlString(category)}, 'ondo', ${sqlString(row.ticker)}, false, true, 'watch', '{}', 0, 0) on conflict (symbol) do nothing;`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}`;
}

async function main() {
  const { header, rows } = parseOndoCsv(readFileSync(CSV_PATH, "utf8"));
  const seed = buildOndoSeed(rows, header);

  const problems = [];
  if (seed.counts.included !== EXPECTED_COUNTS.included) {
    problems.push(`agregados ${seed.counts.included} (esperado ${EXPECTED_COUNTS.included})`);
  }
  if (seed.counts.ondoWinsBoth !== EXPECTED_COUNTS.ondoWinsBoth) {
    problems.push(`ondo-gana-ambos ${seed.counts.ondoWinsBoth} (esperado ${EXPECTED_COUNTS.ondoWinsBoth})`);
  }
  if (seed.counts.onlyOndo !== EXPECTED_COUNTS.onlyOndo) {
    problems.push(`solo-ondo ${seed.counts.onlyOndo} (esperado ${EXPECTED_COUNTS.onlyOndo})`);
  }
  if (seed.counts.excluded !== EXPECTED_COUNTS.excluded) {
    problems.push(`excluidos ${seed.counts.excluded} (esperado ${EXPECTED_COUNTS.excluded})`);
  }
  // Invariantes duras: sin duplicados, ningún incluido apalancado, símbolos únicos.
  const tickers = new Set();
  const mints = new Set();
  const symbols = new Set();
  for (const row of seed.included) {
    if (tickers.has(row.ticker)) problems.push(`ticker duplicado ${row.ticker}`);
    tickers.add(row.ticker);
    if (mints.has(row.mint)) problems.push(`mint duplicado ${row.ticker}`);
    mints.add(row.mint);
    const symbol = `${row.ticker}on`;
    if (symbols.has(symbol)) problems.push(`símbolo duplicado ${symbol}`);
    symbols.add(symbol);
    const micHint = row.kind === "etf" ? "ARCX" : "XNAS";
    if (classifyProduct(row.name, micHint) === "leveraged") {
      problems.push(`incluido apalancado ${row.ticker} (${row.name})`);
    }
  }
  for (const missing of ["TQQQ", "SOXL", "SOXS", "SQQQ", "PSQ", "AI"]) {
    if (!seed.excluded.some((entry) => entry.ticker === missing)) {
      problems.push(`falta excluir ${missing}`);
    }
  }

  console.log(`Agregados: ${seed.counts.included}`);
  console.log(`Ondo gana por volumen (ambos): ${seed.counts.ondoWinsBoth}`);
  console.log(`Solo Ondo: ${seed.counts.onlyOndo}`);
  console.log(`Excluidos: ${seed.counts.excluded} (${seed.excluded.map((entry) => entry.ticker).sort().join(", ")})`);

  if (problems.length > 0) {
    for (const problem of problems) console.error(`ERROR: ${problem}`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(path.dirname(GENERATED_PATH), { recursive: true });
  writeFileSync(GENERATED_PATH, buildGeneratedTs(seed), "utf8");
  mkdirSync(path.dirname(MIGRATION_PATH), { recursive: true });
  writeFileSync(MIGRATION_PATH, buildMigrationSql(seed), "utf8");
  console.log(`Generado: config/ondo.generated.ts (${seed.included.length} filas)`);
  console.log(`Generado: supabase/migrations/0022_ondo_issuer.sql`);
}

const isMain =
  typeof process.argv[1] === "string" && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}

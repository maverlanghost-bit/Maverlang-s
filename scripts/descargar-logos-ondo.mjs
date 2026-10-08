/**
 * Descarga una vez los logos de Ondo a public/logos/<ticker>.png.
 * Fuente: https://cdn.ondo.finance/tokens/logos/<simbolo>_160x160.png
 * No pisa un archivo que ya exista (los de xStocks se quedan).
 * Sin dependencias. La app no hace hotlinking.
 *
 * Uso: node scripts/descargar-logos-ondo.mjs
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "logos");
const SOURCE = "https://cdn.ondo.finance/tokens/logos";
const CONCURRENCY = 8;

function safeLogoFileName(underlying) {
  const slug = underlying
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug.length > 0 ? slug : "token"}.png`;
}

function isPng(bytes) {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function pairsFromGenerated(source) {
  const rows = [];
  const re = /symbol: "([^"]+)", ticker: "([^"]+)"/g;
  for (const match of source.matchAll(re)) {
    const symbol = match[1];
    const ticker = match[2];
    if (symbol && ticker) rows.push({ symbol, ticker });
  }
  return rows;
}

async function downloadOne(row) {
  const destName = safeLogoFileName(row.ticker);
  const dest = path.join(OUT_DIR, destName);
  if (await exists(dest)) return { symbol: row.symbol, ok: true, skipped: true, dest };
  const url = `${SOURCE}/${row.symbol.toLowerCase()}_160x160.png`;
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (response.status !== 200 || !isPng(bytes)) {
    return { symbol: row.symbol, ok: false, status: response.status, bytes: bytes.length };
  }
  await writeFile(dest, bytes);
  return { symbol: row.symbol, ok: true, skipped: false, dest, bytes: bytes.length };
}

async function main() {
  const generated = await readFile(path.join(ROOT, "config", "ondo.generated.ts"), "utf8");
  const rows = pairsFromGenerated(generated);
  if (rows.length === 0) {
    console.error("No encontré filas en config/ondo.generated.ts");
    process.exitCode = 1;
    return;
  }
  await mkdir(OUT_DIR, { recursive: true });
  let next = 0;
  let saved = 0;
  let skipped = 0;
  const failed = [];
  async function worker() {
    while (next < rows.length) {
      const index = next;
      next += 1;
      const row = rows[index];
      try {
        const result = await downloadOne(row);
        if (!result.ok) {
          failed.push(result.symbol);
          console.error(`FALLO ${result.symbol}: status=${result.status} bytes=${result.bytes}`);
          continue;
        }
        if (result.skipped) skipped += 1;
        else {
          saved += 1;
          console.log(`ok ${result.symbol} -> ${path.relative(ROOT, result.dest)} (${result.bytes} bytes)`);
        }
      } catch (error) {
        failed.push(row.symbol);
        console.error(`FALLO ${row.symbol}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker()));
  console.log(`Listo: ${saved} nuevos, ${skipped} ya estaban, ${failed.length} fallaron, de ${rows.length}.`);
  if (failed.length > 0) {
    console.error(failed.join(", "));
    process.exitCode = 1;
  }
}

await main();

/**
 * Descarga una vez los logos de xStocks a public/logos/<underlying>.png.
 * Fuente: https://xstocks-metadata.backed.fi/logos/tokens/<SIMBOLO>.png
 * Sin dependencias. No hace hotlinking en la app: los PNG quedan en el repo.
 *
 * Uso: node scripts/descargar-logos.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Misma lista que config/tickers.ts. El símbolo lleva la "x" final. */
const SYMBOLS = [
  "AAPLx",
  "NVDAx",
  "TSLAx",
  "SPYx",
  "QQQx",
  "GOOGLx",
  "MSFTx",
  "AMZNx",
  "METAx",
  "CRCLx",
  "HOODx",
  "MSTRx",
];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "logos");
const SOURCE = "https://xstocks-metadata.backed.fi/logos/tokens";

function isPng(bytes) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function pngMeta(bytes) {
  if (!isPng(bytes) || bytes.length < 26) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colorType = bytes[25];
  let offset = 8;
  let hasTrns = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "tRNS") hasTrns = true;
    if (type === "IEND") break;
    offset += 12 + length;
  }
  const alpha = colorType === 4 || colorType === 6 || hasTrns;
  return { width, height, colorType, alpha };
}

async function downloadOne(symbol) {
  const underlying = symbol.slice(0, -1).toLowerCase();
  const dest = path.join(OUT_DIR, `${underlying}.png`);
  const url = `${SOURCE}/${symbol}.png`;
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  const contentType = response.headers.get("content-type") ?? "";
  const bytes = Buffer.from(await response.arrayBuffer());
  const imageType = contentType.toLowerCase().startsWith("image/");

  if (response.status !== 200 || !imageType || bytes.length === 0 || !isPng(bytes)) {
    return {
      symbol,
      ok: false,
      status: response.status,
      contentType: contentType || "(vacío)",
      bytes: bytes.length,
      reason:
        response.status !== 200
          ? "http"
          : !imageType
            ? "content-type"
            : bytes.length === 0
              ? "vacío"
              : "no-png",
    };
  }

  await writeFile(dest, bytes);
  return { symbol, ok: true, dest, bytes: bytes.length, contentType, meta: pngMeta(bytes) };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const failed = [];

  for (const symbol of SYMBOLS) {
    try {
      const result = await downloadOne(symbol);
      if (!result.ok) {
        failed.push(result);
        console.error(
          `FALLO ${result.symbol}: ${result.reason} status=${result.status} type=${result.contentType} bytes=${result.bytes}`,
        );
        continue;
      }
      const meta = result.meta;
      const size = meta ? `${meta.width}x${meta.height} color=${meta.colorType} alpha=${meta.alpha}` : "sin IHDR";
      console.log(`ok ${result.symbol} -> ${path.relative(ROOT, result.dest)} (${result.bytes} bytes, ${size})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ symbol, reason: "red", message });
      console.error(`FALLO ${symbol}: red ${message}`);
    }
  }

  if (failed.length > 0) {
    console.error(`Fallaron ${failed.length}: ${failed.map((item) => item.symbol).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Listo: ${SYMBOLS.length} logos en public/logos/`);
}

await main();

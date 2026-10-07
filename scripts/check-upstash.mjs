/**
 * Verifica Upstash contra `.env.local` (M49). Lo corre el operador, no el CI:
 * lee el archivo con `process.loadEnvFile` sin imprimir valores, hace
 * INCR + EXPIRE sobre `maverlang:check:<timestamp>`, verifica el valor, la
 * BORRA e imprime sólo "OK upstash" o el error (nunca claves).
 *
 * Uso: npm run check:upstash
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  process.loadEnvFile(path.join(root, ".env.local"));
} catch {
  console.error("ERROR upstash: no se pudo leer .env.local");
  process.exit(1);
}

const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
if (!url || !token) {
  console.error("ERROR upstash: faltan UPSTASH_REDIS_REST_URL o UPSTASH_REDIS_REST_TOKEN en .env.local");
  process.exit(1);
}

async function call(pathname, body) {
  const response = await fetch(`${url.replace(/\/$/, "")}${pathname}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(String(payload.error).slice(0, 120));
  return payload.result;
}

const key = `maverlang:check:${Date.now()}`;
try {
  const count = await call("/incr", [key]);
  if (Number(count) !== 1) throw new Error("INCR no devolvió 1");
  await call("/expire", [key, 60]);
  const value = await call("/get", [key]);
  if (String(value) !== "1") throw new Error("GET no devolvió 1");
  await call("/del", [key]);
  const gone = await call("/get", [key]);
  if (gone !== null) throw new Error("DEL no borró la clave");
  console.log("OK upstash");
} catch (error) {
  console.error(`ERROR upstash: ${error instanceof Error ? error.message : "falló"}`);
  process.exit(1);
}

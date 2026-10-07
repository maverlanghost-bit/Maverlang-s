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

async function main() {
  try {
    process.loadEnvFile(path.join(root, ".env.local"));
  } catch {
    console.error("ERROR upstash: no se pudo leer .env.local");
    process.exitCode = 1;
    return;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    console.error("ERROR upstash: faltan UPSTASH_REDIS_REST_URL o UPSTASH_REDIS_REST_TOKEN en .env.local");
    process.exitCode = 1;
    return;
  }

  const base = url.replace(/\/$/, "");

  async function command(args) {
    const response = await fetch(`${base}/`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(String(payload.error).slice(0, 120));
    return payload.result;
  }

  const key = `maverlang:check:${Date.now()}`;
  try {
    const count = await command(["INCR", key]);
    if (Number(count) !== 1) throw new Error("INCR no devolvió 1");
    await command(["EXPIRE", key, "60"]);
    const value = await command(["GET", key]);
    if (String(value) !== "1") throw new Error("GET no devolvió 1");
    await command(["DEL", key]);
    const gone = await command(["GET", key]);
    if (gone !== null) throw new Error("DEL no borró la clave");
    console.log("OK upstash");
  } catch (error) {
    console.error(`ERROR upstash: ${error instanceof Error ? error.message : "falló"}`);
    process.exitCode = 1;
  } finally {
    try {
      await command(["DEL", key]);
    } catch {
      // Limpieza best-effort: el error ya se informó o el check pasó.
    }
  }
}

await main();

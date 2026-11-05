import "server-only";

import { isIP } from "node:net";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { errorMessage, fail } from "@/lib/api/result";

/**
 * Límite de solicitudes (M49): Upstash en producción (global entre las
 * instancias de Vercel) y ventana deslizante en memoria en local o tests.
 *
 * `limit(key, policy)` es la primitiva. `withRateLimit(req, policy, parts)`
 * es el atajo para las rutas: devuelve `null` si pasa, la 429 con
 * `Retry-After` si no, o la 503 si el backend no puede aplicar el cupo de
 * una política sensible (A-02/A1-03: no se falla abierto a memoria).
 * Siempre ANTES de llamar servicios externos.
 */

/** Ventanas en ms. `trade` lleva dos topes: por usuario y por IP. */
export const RATE_LIMIT_POLICIES = {
  /** Órdenes (M49): 20/min por usuario. El tope por IP va en `tradeIp`. */
  trade: { limit: 20, windowMs: 60_000 },
  /** Órdenes: 60/min por IP (frena a un bot aunque rote de cuenta). */
  tradeIp: { limit: 60, windowMs: 60_000 },
  /** Reinicio de la demo: 5/h por usuario. */
  demoReset: { limit: 5, windowMs: 3_600_000 },
  /** Búsqueda del mercado: 60/min por IP (cuida la cuota de Jupiter). */
  search: { limit: 60, windowMs: 60_000 },
  /** Precios: 120/min por IP. */
  prices: { limit: 120, windowMs: 60_000 },
  /** Lecturas y escrituras de `/api/me/*`: 60/min por usuario. */
  me: { limit: 60, windowMs: 60_000 },
  /** Webhooks: 300/min por IP (las firmas se verifican aparte). */
  webhook: { limit: 300, windowMs: 60_000 },
  /** Cron interno: 10/min (hoy no hay rutas `/api/cron/*`; queda definido). */
  cron: { limit: 10, windowMs: 60_000 },
  /** Lista de espera: 5/h por IP. */
  waitlist: { limit: 5, windowMs: 3_600_000 },
  /** Comprar o vender en la demo: 30/min por usuario. */
  demoTrade: { limit: 30, windowMs: 60_000 },
  /** GET públicas (fx, geo, cartera): 60/min por IP. */
  publicGet: { limit: 60, windowMs: 60_000 },
  /** Correo de bienvenida: 3/h por usuario. */
  bienvenida: { limit: 3, windowMs: 3_600_000 },
  /** Correo de bienvenida: 3/h por IP. */
  bienvenidaIp: { limit: 3, windowMs: 3_600_000 },
  /** Asistente IA: 20 cada 10 min por usuario o, si no hay sesión, por IP. */
  ai: { limit: 20, windowMs: 10 * 60_000 },
} as const;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;
export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetMs: number;
  /** El backend no puede aplicar el cupo: la ruta debe fallar cerrada (503). */
  unavailable?: boolean;
}

/**
 * Políticas que protegen costo real (Jupiter/xAI), escrituras o spam.
 * En producción y sin backend global NO se sirven con memoria por instancia:
 * `withRateLimit` responde 503 en vez de multiplicar el cupo por cada lambda.
 */
export const SENSITIVE_RATE_LIMIT_POLICIES = [
  "trade",
  "tradeIp",
  "ai",
  "waitlist",
  "search",
  "prices",
  "webhook",
  "cron",
] as const satisfies readonly RateLimitPolicyName[];

const SENSITIVE_POLICIES: ReadonlySet<RateLimitPolicyName> = new Set(SENSITIVE_RATE_LIMIT_POLICIES);

type Backend = "memory" | "upstash" | "auto";

function backendOf(): Backend {
  const raw = process.env.RATE_LIMIT_BACKEND?.trim().toLowerCase();
  return raw === "memory" || raw === "upstash" || raw === "auto" ? raw : "auto";
}

function upstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

let warnedNoUpstash = false;
let warnedUpstashDown = false;
let warnedUnavailable = false;

/** En producción sin Upstash la memoria no es global: se avisa una vez. */
function warnProductionMemoryOnce(): void {
  if (warnedNoUpstash || !isProduction()) return;
  warnedNoUpstash = true;
  console.warn(
    "rate-limit: sin UPSTASH_REDIS_REST_URL/TOKEN, con memoria local (no es global entre instancias).",
  );
}

/** Política sensible sin backend global: se falla cerrado y se avisa una vez. */
function warnUnavailableOnce(reason: string): void {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  console.error(`rate-limit: ${reason} Las políticas sensibles responden 503 hasta configurar Upstash.`);
}

/**
 * Techo efectivo. Sólo en desarrollo `RATE_LIMIT_TEST_SEARCH` baja la
 * búsqueda (p. ej. `=5`: la sexta en 1 min da 429). En producción se ignora.
 */
export function resolvePolicy(name: RateLimitPolicyName): RateLimitPolicy {
  const base = RATE_LIMIT_POLICIES[name];
  if (name === "search" && process.env.NODE_ENV !== "production") {
    const raw = Number(process.env.RATE_LIMIT_TEST_SEARCH);
    if (Number.isInteger(raw) && raw > 0) return { limit: raw, windowMs: base.windowMs };
  }
  return { limit: base.limit, windowMs: base.windowMs };
}

/* --- IP del cliente (A-02/A1-03: el sujeto no puede venir del cliente) --- */

/** Largo máximo de una IPv6 con IPv4 embebida (`xxxx:…:255.255.255.255`). */
const MAX_IP_LENGTH = 45;

/** IPv6 → forma canónica RFC 5952; una IPv4 mapeada vuelve como IPv4 en punto. */
function canonicalIpv6(raw: string): string | null {
  const lower = raw.toLowerCase();
  // Zona (`fe80::1%eth0`) y corchetes (`[::1]`) fuera: no son una IP de cabecera.
  if (lower.includes("%") || lower.includes("[")) return null;

  let text = lower;
  const tailStart = lower.lastIndexOf(":") + 1;
  const tail = lower.slice(tailStart);
  if (tail.includes(".")) {
    if (isIP(tail) !== 4) return null;
    const octets = tail.split(".").map((part) => Number.parseInt(part, 10));
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return null;
    const high = ((octets[0]! << 8) | octets[1]!).toString(16);
    const low = ((octets[2]! << 8) | octets[3]!).toString(16);
    text = `${lower.slice(0, tailStart)}${high}:${low}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const split = (part: string | undefined): string[] => (part ? part.split(":") : []);
  const left = split(halves[0]);
  const right = halves.length === 2 ? split(halves[1]) : [];
  const missing = 8 - left.length - right.length;
  // `::` tiene que abreviar al menos un grupo; sin `::` deben ser ocho exactos.
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;

  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  const hex: string[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    hex.push(Number.parseInt(group, 16).toString(16));
  }

  // `::ffff:1.2.3.4` y `::ffff:102:304` son la misma IPv4: se canonicalizan a punto.
  if (hex.slice(0, 5).every((part) => part === "0") && hex[5] === "ffff") {
    const high = Number.parseInt(hex[6]!, 16);
    const low = Number.parseInt(hex[7]!, 16);
    return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
  }

  return compressIpv6(hex);
}

/** Comprime la corrida de ceros más larga (la primera si hay empate). */
function compressIpv6(groups: readonly string[]): string {
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < groups.length; ) {
    if (groups[index] !== "0") {
      index += 1;
      continue;
    }
    let end = index;
    while (end < groups.length && groups[end] === "0") end += 1;
    const length = end - index;
    if (length >= 2 && length > bestLength) {
      bestStart = index;
      bestLength = length;
    }
    index = end;
  }
  if (bestStart < 0) return groups.join(":");
  const head = groups.slice(0, bestStart).join(":");
  const tail = groups.slice(bestStart + bestLength).join(":");
  return `${head}::${tail}`;
}

/** IP canónica: IPv4 en punto o IPv6 comprimida en minúsculas; si no es IP, `null`. */
export function canonicalIp(value: string): string | null {
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_IP_LENGTH) return null;
  const family = isIP(candidate);
  if (family === 4) return candidate;
  if (family === 6) return canonicalIpv6(candidate);
  return null;
}

/** Descarta loopback, privadas, link-local, CGNAT, multicast y reservadas. */
function isPublicIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const octets = ip.split(".").map((part) => Number.parseInt(part, 10));
    const [a, b] = octets;
    if (a === undefined || b === undefined) return false;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false;
    return true;
  }
  if (ip === "::" || ip === "::1") return false;
  const first = Number.parseInt(ip.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 (ULA)
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 (link-local)
  if ((first & 0xff00) === 0xff00) return false; // ff00::/8 (multicast)
  return true;
}

/** Valor público más a la derecha de una lista; nunca el primero a ciegas. */
function publicIpFromList(value: string | null): string | null {
  if (!value) return null;
  const parts = value.split(",");
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const ip = canonicalIp(parts[index] ?? "");
    if (ip && isPublicIp(ip)) return ip;
  }
  return null;
}

/**
 * IP del cliente, o `null` si ninguna cabecera trae una IP pública válida.
 *
 * Orden: `x-real-ip` → `x-vercel-forwarded-for` (los pone la plataforma y
 * `XFF` no los puede sobrescribir) → `x-forwarded-for`, del que se toma el
 * valor público **más a la derecha**. Se valida con `node:net` y se
 * canonicaliza (IPv4 mapeada incluida); loopback y privadas se ignoran.
 */
export function ipOfRequest(req: Request): string | null {
  return (
    publicIpFromList(req.headers.get("x-real-ip")) ??
    publicIpFromList(req.headers.get("x-vercel-forwarded-for")) ??
    publicIpFromList(req.headers.get("x-forwarded-for"))
  );
}

function sanitizePart(part: string): string {
  return part.trim().replace(/:/g, "_").slice(0, 200) || "unknown";
}

function keyOf(policyName: RateLimitPolicyName, parts: readonly string[]): string {
  return `maverlang:rl:${policyName}:${parts.map(sanitizePart).join(":")}`;
}

/* --- Ventana deslizante en memoria (local, tests, respaldo) --- */

const memoryHits = new Map<string, number[]>();

function memoryLimit(key: string, policy: RateLimitPolicy, now: number): RateLimitResult {
  const cutoff = now - policy.windowMs;
  const seen = memoryHits.get(key) ?? [];
  const fresh = seen.filter((at) => at > cutoff);
  if (fresh.length >= policy.limit) {
    memoryHits.set(key, fresh);
    return { ok: false, remaining: 0, resetMs: Math.max(0, fresh[0]! + policy.windowMs - now) };
  }
  fresh.push(now);
  memoryHits.set(key, fresh);
  if (memoryHits.size > 5000) {
    for (const [other, times] of memoryHits) {
      const live = times.filter((at) => at > cutoff);
      if (live.length === 0) memoryHits.delete(other);
      else if (live.length !== times.length) memoryHits.set(other, live);
    }
  }
  return { ok: true, remaining: policy.limit - fresh.length, resetMs: policy.windowMs };
}

function unavailableResult(): RateLimitResult {
  return { ok: false, remaining: 0, resetMs: 0, unavailable: true };
}

/* --- Upstash (producción, global) --- */

let redisClient: Redis | null = null;
const limiterCache = new Map<string, Ratelimit>();

function upstashLimiter(policy: RateLimitPolicy): Ratelimit {
  const cacheKey = `${policy.limit}:${policy.windowMs}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;
  redisClient ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!.trim(),
    token: process.env.UPSTASH_REDIS_REST_TOKEN!.trim(),
    // Sin reintentos: con Redis caído cada request debe fallar rápido (429/503),
    // no sumar segundos de backoff antes de decidir.
    retry: false,
  });
  const limiter = new Ratelimit({
    redis: redisClient,
    limiter: Ratelimit.slidingWindow(policy.limit, `${policy.windowMs} ms`),
    analytics: false,
    prefix: "maverlang:rl",
  });
  limiterCache.set(cacheKey, limiter);
  return limiter;
}

/** Sólo para tests: vacía la memoria y los avisos. */
export function __resetRateLimitsForTests(): void {
  memoryHits.clear();
  limiterCache.clear();
  redisClient = null;
  warnedNoUpstash = false;
  warnedUpstashDown = false;
  warnedUnavailable = false;
}

/**
 * Primitiva: `limit(key, policy)` → `{ ok, remaining, resetMs }`.
 *
 * Backend: `RATE_LIMIT_BACKEND=upstash` exige credenciales; `auto` usa Redis
 * si están y memoria si no; `memory` explícito siempre usa memoria.
 * `policyName` marca las políticas sensibles: en producción, sin backend
 * global disponible, NO caen a memoria por instancia y devuelven
 * `{ ok: false, unavailable: true }` para que la ruta responda 503. Sin
 * nombre se asume sensible (fail-closed): sólo `withRateLimit` conoce las
 * políticas que pueden seguir con memoria.
 */
export async function limit(
  key: string,
  policy: RateLimitPolicy,
  policyName?: RateLimitPolicyName,
): Promise<RateLimitResult> {
  const sensitive = policyName ? SENSITIVE_POLICIES.has(policyName) : true;
  const backend = backendOf();
  // T41: `RATE_LIMIT_BACKEND=memory` es una decisión de operador, pero en
  // producción no puede aplicarse a una política sensible: el cupo pasaría a
  // contar por instancia y se multiplicaría por cada lambda (A-02), que es
  // justo lo que la ventana global evita. Se falla cerrado igual que sin
  // credenciales. Desarrollo, demo y test siguen con memoria.
  if (backend === "memory") {
    if (isProduction() && sensitive) {
      warnUnavailableOnce(
        "RATE_LIMIT_BACKEND=memory en producción: una política sensible no se aplica por instancia.",
      );
      return unavailableResult();
    }
    return memoryLimit(key, policy, Date.now());
  }

  // `upstash` explícito siempre falla cerrado; `auto` sólo en producción y
  // para políticas sensibles. El resto mantiene la memoria por disponibilidad.
  const failClosed = backend === "upstash" || (isProduction() && sensitive);

  if (!upstashConfigured()) {
    if (failClosed) {
      warnUnavailableOnce(
        backend === "upstash"
          ? "RATE_LIMIT_BACKEND=upstash sin UPSTASH_REDIS_REST_URL/TOKEN."
          : "producción sin UPSTASH_REDIS_REST_URL/TOKEN.",
      );
      return unavailableResult();
    }
    warnProductionMemoryOnce();
    return memoryLimit(key, policy, Date.now());
  }

  try {
    const outcome = await upstashLimiter(policy).limit(key);
    return {
      ok: outcome.success,
      remaining: Math.max(0, outcome.remaining),
      resetMs: Math.max(0, outcome.reset - Date.now()),
    };
  } catch {
    if (failClosed) {
      warnUnavailableOnce("Upstash no respondió.");
      return unavailableResult();
    }
    if (!warnedUpstashDown) {
      warnedUpstashDown = true;
      console.warn("rate-limit: Upstash no respondió, con memoria local.");
    }
    return memoryLimit(key, policy, Date.now());
  }
}

function rateLimitHeaders(resetMs: number): Headers {
  const headers = new Headers();
  headers.set("Retry-After", String(Math.max(1, Math.ceil(resetMs / 1000))));
  headers.set("X-RateLimit-Remaining", "0");
  return headers;
}

/** 503 cuando el backend no puede aplicar el cupo: se falla cerrado, no abierto. */
function unavailableResponse(shape: "result" | "plain"): Response {
  const message = errorMessage("RATE_LIMIT_UNAVAILABLE");
  const body =
    shape === "plain"
      ? { error: { code: "RATE_LIMIT_UNAVAILABLE", message } }
      : fail("RATE_LIMIT_UNAVAILABLE", message);
  const headers = new Headers();
  headers.set("Retry-After", "30");
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { status: 503, headers });
}

/**
 * Atajo para las rutas con `handle()`: si pasa, `null`; si no, la 429; si el
 * backend no puede aplicar el cupo, la 503.
 * `parts` identifica al sujeto (p. ej. `[userId]`); vacío = por IP.
 * `shape "plain"` (`/api/waitlist`, sin `handle`) devuelve
 * `{ error: { code, message } }`; si no, el `ApiResult` con el mismo error.
 */
export async function withRateLimit(
  req: Request,
  policyName: RateLimitPolicyName,
  parts: readonly string[] = [],
  shape: "result" | "plain" = "result",
): Promise<Response | null> {
  const policy = resolvePolicy(policyName);
  const subject = parts.length > 0 ? parts : [ipOfRequest(req) ?? "unknown"];
  const result = await limit(keyOf(policyName, subject), policy, policyName);
  if (result.unavailable) return unavailableResponse(shape);
  if (result.ok) return null;
  const message = errorMessage("RATE_LIMITED");
  const body =
    shape === "plain"
      ? { error: { code: "RATE_LIMITED", message } }
      : fail("RATE_LIMITED", message);
  return Response.json(body, { status: 429, headers: rateLimitHeaders(result.resetMs) });
}

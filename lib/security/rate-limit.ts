import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { errorMessage, fail } from "@/lib/api/result";

/**
 * Límite de solicitudes (M49): Upstash en producción (global entre las
 * instancias de Vercel) y ventana deslizante en memoria en local o tests.
 *
 * `limit(key, policy)` es la primitiva. `withRateLimit(req, policy, parts)`
 * es el atajo para las rutas: devuelve `null` si pasa o la respuesta 429
 * con `Retry-After` si no. Siempre ANTES de llamar servicios externos.
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
}

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

let warnedNoUpstash = false;
let warnedUpstashDown = false;

/** En producción sin Upstash la memoria no es global: se avisa una vez. */
function warnProductionMemoryOnce(): void {
  if (warnedNoUpstash || process.env.NODE_ENV !== "production") return;
  warnedNoUpstash = true;
  console.warn(
    "rate-limit: sin UPSTASH_REDIS_REST_URL/TOKEN, con memoria local (no es global entre instancias).",
  );
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

/** IP en Vercel: primer valor de `x-forwarded-for`, o `x-real-ip`. */
export function ipOfRequest(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 200);
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 200);
  return "unknown";
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
}

/**
 * Primitiva: `limit(key, policy)` → `{ ok, remaining, resetMs }`.
 * Con Upstash configurado (o `RATE_LIMIT_BACKEND=upstash`) usa Redis;
 * si no, memoria. Si Upstash falla, avisa una vez y cae a memoria
 * (disponibilidad antes que bloqueo en la demo).
 */
export async function limit(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
  const backend = backendOf();
  const useUpstash = backend === "upstash" || (backend === "auto" && upstashConfigured());
  if (!useUpstash) {
    if (backend === "auto" && !upstashConfigured()) warnProductionMemoryOnce();
    return memoryLimit(key, policy, Date.now());
  }
  if (backend === "upstash" && !upstashConfigured()) warnProductionMemoryOnce();
  try {
    const outcome = await upstashLimiter(policy).limit(key);
    return {
      ok: outcome.success,
      remaining: Math.max(0, outcome.remaining),
      resetMs: Math.max(0, outcome.reset - Date.now()),
    };
  } catch {
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

/**
 * Atajo para las rutas con `handle()`: si pasa, `null`; si no, la 429.
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
  const subject = parts.length > 0 ? parts : [ipOfRequest(req)];
  const result = await limit(keyOf(policyName, subject), policy);
  if (result.ok) return null;
  const message = errorMessage("RATE_LIMITED");
  const body =
    shape === "plain"
      ? { error: { code: "RATE_LIMITED", message } }
      : fail("RATE_LIMITED", message);
  return Response.json(body, { status: 429, headers: rateLimitHeaders(result.resetMs) });
}

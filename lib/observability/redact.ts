/**
 * Redacción de PII y secretos antes de enviar eventos a Sentry (M-02).
 *
 * Módulo puro y sin dependencias: lo importan `sentry.server.config.ts`
 * (runtime Node), `instrumentation-client.ts` (navegador) y las pruebas. No
 * usa APIs de Node ni `server-only`, así que el bundle del cliente no arrastra
 * código de servidor.
 *
 * Criterio: se redacta por nombre de campo (`email`, `rut`, `telefono`,
 * `token`…), por parámetro de query (`api-key`, `token`, `secret`…) y por
 * patrón dentro del texto (JWT, claves con prefijo, `Bearer`, correo y RUT).
 * El valor reemplazado es `[REDACTADO]`, el mismo marcador que ya usa
 * `lib/solana/tx-errors.ts` para sus logs.
 */

/** Marcador único de dato redactado (la auditoría M-02 busca este texto). */
export const REDACTED = "[REDACTADO]";

const MAX_DEPTH = 10;
const MAX_ARRAY_ITEMS = 100;

/**
 * Parámetros de query que nunca deben viajar a Sentry: credenciales de RPC
 * (Helius/Jupiter), tokens de sesión y PII. Comparación sin distinguir
 * mayúsculas; acepta `api-key` y `api_key` porque ambos aparecen en el código.
 */
const SENSITIVE_QUERY_PARAMS = [
  "api-key",
  "api_key",
  "apikey",
  "key",
  "token",
  "access_token",
  "access-token",
  "refresh_token",
  "refresh-token",
  "id_token",
  "id-token",
  "secret",
  "client_secret",
  "client-secret",
  "private_key",
  "private-key",
  "password",
  "passwd",
  "authorization",
  "auth",
  "sig",
  "signature",
  "jwt",
  "session",
  "session_token",
  "code",
  "email",
  "correo",
  "rut",
  "telefono",
  "phone",
] as const;

const QUERY_PARAM_RE = new RegExp(
  `(^|[?&;\\s])(${SENSITIVE_QUERY_PARAMS.map(escapeRegExp).join("|")})=[^&#\\s"']*`,
  "gi",
);

/** `https://usuario:clave@host` → se tapa todo el bloque de credenciales. */
const URL_USERINFO_RE = /(\/\/)[^\s/@]+@/g;

/** `Bearer <token>` dentro de un mensaje o header serializado. */
const BEARER_RE = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi;

/** JWT (tres segmentos base64url; el primero siempre empieza con `eyJ`). */
const JWT_RE = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g;

/** Claves con prefijo reconocible (Stripe, Supabase, GitHub, Slack, Resend). */
const PREFIXED_KEY_RE =
  /\b(?:(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{6,}|sb_secret_[A-Za-z0-9_-]{8,}|sbp_[A-Za-z0-9]{8,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|re_[A-Za-z0-9]{16,})\b/g;

/** Correo electrónico (puede venir en un mensaje de Supabase o de un RPC). */
const EMAIL_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** RUT chileno con o sin puntos: 12.345.678-9 / 12345678-9. */
const RUT_RE = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g;

/** Teléfono chileno en formato internacional: +56 9 1234 5678. */
const PHONE_RE = /\+\s?56[\s.-]?\d[\s.-]?\d{4}[\s.-]?\d{4}\b/g;

/** Nombres de campo que se tapan completos (normalizados: sin `_` ni `-`). */
const SENSITIVE_KEY_EXACT = new Set([
  "email",
  "emailaddress",
  "correo",
  "correoelectronico",
  "mail",
  "useremail",
  "username",
  "login",
  "ipaddress",
  "rut",
  "run",
  "dni",
  "documento",
  "documentnumber",
  "taxid",
  "telefono",
  "telefonomovil",
  "phone",
  "phonenumber",
  "mobile",
  "celular",
  "password",
  "passwd",
  "pass",
  "contrasena",
  "passwordhash",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "sessiontoken",
  "authtoken",
  "jwt",
  "bearer",
  "secret",
  "clientsecret",
  "apisecret",
  "privatekey",
  "apikey",
  "xapikey",
  "authorization",
  "proxyauthorization",
  "cookie",
  "setcookie",
  "key",
]);

/**
 * Sufijos que delatan un campo sensible aunque venga compuesto
 * (`userEmail`, `access_token`, `X-Api-Key`). Se comparan ya normalizados.
 */
const SENSITIVE_KEY_SUFFIXES = [
  "email",
  "correo",
  "telefono",
  "phone",
  "password",
  "secret",
  "token",
  "apikey",
  "authorization",
  "cookie",
  "sessionid",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normaliza un nombre de campo: minúsculas y sólo letras/números. */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Indica si un campo/header debe redactarse por su nombre. */
export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (!normalized) return false;
  if (SENSITIVE_KEY_EXACT.has(normalized)) return true;
  return SENSITIVE_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/**
 * Redacta parámetros sensibles y credenciales embebidas en una URL (o en
 * cualquier texto que contenga una). Es idempotente: aplicar dos veces deja
 * el mismo resultado.
 */
export function redactUrl(value: string): string {
  if (!value) return value;
  return value
    .replace(QUERY_PARAM_RE, `$1$2=${REDACTED}`)
    .replace(URL_USERINFO_RE, `$1${REDACTED}@`)
    .replace(BEARER_RE, `$1${REDACTED}`)
    .replace(JWT_RE, REDACTED)
    .replace(PREFIXED_KEY_RE, REDACTED);
}

/**
 * Redacta secretos y PII en texto libre: URLs con claves, JWT, claves con
 * prefijo, `Bearer`, correos, RUT y teléfonos. Se usa en mensajes de error,
 * breadcrumbs de `console` y valores de headers.
 */
export function redactText(value: string): string {
  if (!value) return value;
  return redactUrl(value)
    .replace(EMAIL_RE, REDACTED)
    .replace(RUT_RE, REDACTED)
    .replace(PHONE_RE, REDACTED);
}

/** Copia de headers con los sensibles en `[REDACTADO]` (case-insensitive). */
export function redactHeaders(headers: unknown): Record<string, unknown> {
  if (!isRecord(headers)) return {};
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = isSensitiveKey(name)
      ? REDACTED
      : typeof value === "string"
        ? redactText(value)
        : redactDeep(value);
  }
  return out;
}

/** Las cookies de sesión se tapan completas; el nombre se conserva para depurar. */
export function redactCookies(cookies: unknown): unknown {
  if (!isRecord(cookies)) return redactDeep(cookies);
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(cookies)) out[name] = REDACTED;
  return out;
}

/**
 * Redacta `request.query_string` en sus tres formas posibles del SDK:
 * string (`a=1&api-key=x`), objeto (`{ "api-key": "x" }`) o lista de pares
 * (`[["api-key", "x"]]`).
 */
export function redactQueryString(query: unknown): unknown {
  if (typeof query === "string") return redactText(query);
  if (Array.isArray(query)) {
    return query.map((entry) => {
      if (Array.isArray(entry) && typeof entry[0] === "string") {
        const key = entry[0];
        const raw = entry[1];
        const value = isSensitiveKey(key)
          ? REDACTED
          : typeof raw === "string"
            ? redactText(raw)
            : redactDeep(raw);
        return [key, value];
      }
      return redactDeep(entry);
    });
  }
  if (isRecord(query)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(query)) {
      out[key] = isSensitiveKey(key)
        ? REDACTED
        : typeof value === "string"
          ? redactText(value)
          : redactDeep(value);
    }
    return out;
  }
  return redactDeep(query);
}

/**
 * Recorre un valor arbitrario y devuelve una copia redactada. No muta la
 * entrada, tolera ciclos y acota profundidad/tamaño para no colgarse con
 * objetos gigantes. Strings se limpian con `redactText`; los campos cuyo
 * nombre es sensible se reemplazan completos.
 */
export function redactDeep<T>(value: T, options?: { maxDepth?: number }): T {
  const maxDepth = options?.maxDepth ?? MAX_DEPTH;
  return walk(value, 0, new WeakSet<object>(), maxDepth) as T;
}

function walk(value: unknown, depth: number, seen: WeakSet<object>, maxDepth: number): unknown {
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= maxDepth) return REDACTED;

  if (value instanceof Date) return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
      stack: value.stack ? redactText(value.stack) : undefined,
    };
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return REDACTED;

  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => walk(item, depth + 1, seen, maxDepth));
      if (value.length > MAX_ARRAY_ITEMS) items.push(`[…${value.length - MAX_ARRAY_ITEMS} más]`);
      return items;
    }

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : walk(item, depth + 1, seen, maxDepth);
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/**
 * Sanea un breadcrumb de Sentry. Cubre `fetch`/`xhr` (URL de la petición),
 * `navigation` y `console` (mensaje y argumentos con PII).
 */
export function scrubSentryBreadcrumb<T>(breadcrumb: T): T {
  const scrubbed = redactDeep(breadcrumb);
  if (!isRecord(scrubbed)) return scrubbed;

  const record: Record<string, unknown> = scrubbed;
  const data = record.data;
  if (isRecord(data)) {
    for (const field of ["url", "from", "to"] as const) {
      if (typeof data[field] === "string") data[field] = redactUrl(data[field]);
    }
  }
  if (typeof record.message === "string") record.message = redactText(record.message);

  return record as T;
}

/**
 * Sanea un evento de Sentry antes de enviarlo (`beforeSend`). Además del
 * recorrido profundo, fuerza el tratamiento de `request.headers`,
 * `request.query_string`, `request.cookies`, `request.url` y de los
 * breadcrumbs, que son los puntos por donde se filtran secretos y PII.
 */
export function scrubSentryEvent<T>(event: T): T {
  const scrubbed = redactDeep(event);
  if (!isRecord(scrubbed)) return scrubbed;

  const record: Record<string, unknown> = scrubbed;
  const request = record.request;
  if (isRecord(request)) {
    if (request.headers !== undefined) request.headers = redactHeaders(request.headers);
    if (request.query_string !== undefined) request.query_string = redactQueryString(request.query_string);
    if (request.cookies !== undefined) request.cookies = redactCookies(request.cookies);
    if (typeof request.url === "string") request.url = redactUrl(request.url);
    if (request.data !== undefined) request.data = redactDeep(request.data);
  }

  if (Array.isArray(record.breadcrumbs)) {
    record.breadcrumbs = record.breadcrumbs.map((breadcrumb) => scrubSentryBreadcrumb(breadcrumb));
  }

  return record as T;
}

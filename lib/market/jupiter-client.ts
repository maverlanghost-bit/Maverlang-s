/**
 * Cliente HTTP de Jupiter Swap v2. Delgado y testeable: `fetchImpl` y el
 * reloj/espera se inyectan, así los tests corren sin red. Con las keys
 * reales el servicio le pasa `fetch` verdadero y esto no cambia.
 *
 * Decisiones de red (documentadas para no adivinar en producción):
 * - La key viaja SOLO por header `x-api-key`, nunca en la URL (no queda en
 *   logs ni en el historial del navegador).
 * - 429 y 5xx se reintentan con backoff exponencial + jitter. Júpiter pide
 *   backoff y distribuir las llamadas en vez de rfaga.
 * - 4xx (salvo 429) NO se reintentan: el request está mal y repetirlo gasta
 *   cuota para nada.
 * - `/swap/v2/execute` tiene su propio bucket y no cuenta para el límite
 *   principal; aquí sólo hablamos de `/order` y `/build`, que sí cuentan.
 */

export interface JupiterClientOptions {
  /** Base de la API, p. ej. https://api.jup.ag. */
  base: string;
  /** Key de Jupiter. Viaja por header; nunca en la URL. */
  apiKey?: string;
  /** Implementación de fetch inyectable (tests). */
  fetchImpl?: typeof fetch;
  /** Timeout por llamada en ms. */
  timeoutMs?: number;
  /** Máximo de reintentos además del intento inicial. */
  maxRetries?: number;
  /** Espera entre reintentos (inyectable en tests para no dormir). */
  sleep?: (ms: number) => Promise<void>;
  /** Reloj inyectable (tests). */
  now?: () => number;
}

const DEFAULT_TIMEOUT_MS = 6_000;
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 400;

export function jupiterHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  const key = apiKey?.trim();
  if (key) headers["x-api-key"] = key;
  return headers;
}

/** 429 y 5xx se reintentan; el resto de 4xx no. */
export function isRetryableJupiterError(input: { status: number }): boolean {
  return input.status === 429 || input.status >= 500;
}

function backoffMs(attempt: number, now: () => number): number {
  const exponential = BASE_BACKOFF_MS * 2 ** attempt;
  const jitter = Math.floor(now() % 200);
  return exponential + jitter;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * GET de una orden de Jupiter (`/swap/v2/order` o `/swap/v2/build`) con
 * reintentos. Devuelve el cuerpo ya parseado. Lanza Error con el status en
 * el mensaje si al final no se pudo (el servicio lo mapea a UPSTREAM).
 */
export async function fetchJupiterOrder(
  input: { url: string; fetchImpl?: typeof fetch } & JupiterClientOptions,
): Promise<unknown> {
  const {
    url,
    base,
    apiKey,
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    sleep = defaultSleep,
    now = () => Date.now(),
  } = input;
  void base; // la URL ya viene armada por el llamador

  let lastError: Error = new Error("Jupiter: sin respuesta");
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response | undefined;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: jupiterHeaders(apiKey),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      // Fallo de red o abort por timeout: reintentable.
      lastError = error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timer);
    }

    if (response) {
      if (response.ok) return (await response.json()) as unknown;
      lastError = new Error(`Jupiter ${response.status}`);
      // 4xx (salvo 429): el request está mal; repetirlo sólo gasta cuota.
      if (!isRetryableJupiterError({ status: response.status })) break;
    }
    if (attempt < maxRetries) await sleep(backoffMs(attempt, now));
  }
  throw lastError;
}

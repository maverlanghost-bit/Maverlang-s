/**
 * Service worker de estáticos. No guarda /api, navegaciones ni páginas con
 * datos de la cuenta. `fetchPlan` y `canStoreStaticResponse` son la lógica
 * pura que cubre tests/unit/pwa.test.ts.
 */

export const STATIC_CACHE_NAME = "maverlang-static-v1";
const CACHE_PREFIX = "maverlang-static-";

const BLOCKED_ROOTS = ["/api", "/app", "/auth", "/admin", "/bloqueado", "/dev", "/_next/data", "/_next/image"];
const PUBLIC_ASSET = /^\/(?:brand|logos)\/.+\.(?:png|jpe?g|webp|gif|svg|ico|woff2?)$/i;
const RSC_QUERY = /(?:^|[?&])_rsc(?:=|&|$)/;
const ALLOWED_TYPE =
  /^(?:image\/|font\/|text\/css\b|text\/javascript\b|application\/javascript\b|application\/manifest\+json\b|application\/font-)/i;

/**
 * @param {string} pathname
 */
export function isBlockedPath(pathname) {
  for (const root of BLOCKED_ROOTS) {
    if (pathname === root || pathname.startsWith(`${root}/`)) return true;
  }
  return false;
}

/**
 * @param {string} search
 */
export function hasRscQuery(search) {
  return RSC_QUERY.test(search);
}

/**
 * @param {string} pathname
 */
export function isImmutableAsset(pathname) {
  return pathname.startsWith("/_next/static/");
}

/**
 * @param {{ method: string, destination: string, mode: string, pathname: string, search: string, origin: string }} request
 * @param {string} pageOrigin
 */
export function shouldCacheStatic(request, pageOrigin) {
  if (request.method !== "GET") return false;
  if (request.origin !== pageOrigin) return false;
  if (request.mode === "navigate" || request.destination === "document") return false;
  const path = request.pathname || "/";
  if (path === "/sw.js") return false;
  if (isBlockedPath(path) || hasRscQuery(request.search || "")) return false;
  if (isImmutableAsset(path)) return true;
  if (path === "/manifest.webmanifest") return true;
  return PUBLIC_ASSET.test(path);
}

/**
 * @param {{ method: string, destination: string, mode: string, pathname: string, search: string, origin: string }} request
 * @param {string} pageOrigin
 * @returns {"bypass" | "cache-first" | "network-first"}
 */
export function fetchPlan(request, pageOrigin) {
  if (!shouldCacheStatic(request, pageOrigin)) return "bypass";
  return isImmutableAsset(request.pathname || "/") ? "cache-first" : "network-first";
}

/**
 * @param {{ ok: boolean, status: number, type: string, redirected: boolean, contentType: string | null, setCookie: string | null }} response
 */
export function canStoreStaticResponse(response) {
  if (!response || response.ok !== true || response.status !== 200) return false;
  if (response.redirected === true) return false;
  if (response.type !== "basic" && response.type !== "default") return false;
  if (response.setCookie) return false;
  const contentType = String(response.contentType || "").toLowerCase();
  if (!contentType) return false;
  return ALLOWED_TYPE.test(contentType);
}

/**
 * @param {Response} response
 */
function responseProbe(response) {
  return {
    ok: response.ok === true,
    status: response.status,
    type: response.type || "",
    redirected: response.redirected === true,
    contentType: response.headers.get("content-type"),
    setCookie: response.headers.get("set-cookie"),
  };
}

/**
 * @param {Request} request
 * @param {Response} response
 */
async function storeIfSafe(request, response) {
  if (!canStoreStaticResponse(responseProbe(response))) return response;
  const cache = await caches.open(STATIC_CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

/**
 * @param {Request} request
 */
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  return storeIfSafe(request, response);
}

/**
 * @param {Request} request
 */
async function networkFirst(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  try {
    const response = await fetch(request);
    return storeIfSafe(request, response);
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw error;
  }
}

async function clearOldCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE_NAME).map((key) => caches.delete(key)),
  );
}

/**
 * @param {ServiceWorkerGlobalScope} scope
 */
function bind(scope) {
  scope.addEventListener("install", (event) => {
    event.waitUntil(scope.skipWaiting());
  });
  scope.addEventListener("activate", (event) => {
    event.waitUntil(Promise.all([clearOldCaches(), scope.clients.claim()]));
  });
  scope.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    const plan = fetchPlan(
      {
        method: event.request.method,
        destination: event.request.destination || "",
        mode: event.request.mode || "",
        pathname: url.pathname,
        search: url.search,
        origin: url.origin,
      },
      scope.location.origin,
    );
    if (plan === "bypass") return;
    event.respondWith(plan === "cache-first" ? cacheFirst(event.request) : networkFirst(event.request));
  });
}

const workerGlobal = globalThis;
if (typeof workerGlobal.skipWaiting === "function") {
  bind(workerGlobal);
}

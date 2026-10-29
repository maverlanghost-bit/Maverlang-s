import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildManifestFields,
  installOffer,
  isInstalledDisplay,
  isIosHomeScreenDevice,
  isInstallDismissed,
  isStartInsideScope,
  pwaShortName,
  PUBLIC_WORDMARK,
  PWA_SCOPE,
  PWA_START_URL,
  PWA_THEME_COLOR,
  shouldCaptureInstallPrompt,
  shouldRegisterServiceWorker,
} from "@/components/pwa/policy";
import { pwaCopy, pwaExtra, type PwaCopy } from "@/content/i18n/extra-pwa";
import { canStoreStaticResponse, fetchPlan, shouldCacheStatic } from "../../public/sw.js";

const ORIGIN = "https://maverlang.example";
const ADVICE = /compra|vende|\bbuy\b|\bsell\b|garantiz|risk-free|risk free|rentabilidad/i;

type CacheProbe = {
  method: string;
  destination: string;
  mode: string;
  pathname: string;
  search: string;
  origin: string;
};

function probe(partial: Partial<CacheProbe> & Pick<CacheProbe, "pathname">): CacheProbe {
  return {
    method: "GET",
    destination: "",
    mode: "same-origin",
    search: "",
    origin: ORIGIN,
    ...partial,
  };
}

function pngSize(file: string) {
  const bytes = readFileSync(path.join(process.cwd(), file));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("cache del service worker", () => {
  it("guarda sólo estáticos propios y nunca la API ni las páginas", () => {
    expect(fetchPlan(probe({ pathname: "/_next/static/chunks/app.js", destination: "script" }), ORIGIN)).toBe("cache-first");
    expect(fetchPlan(probe({ pathname: "/_next/static/css/app.css", destination: "style" }), ORIGIN)).toBe("cache-first");
    expect(fetchPlan(probe({ pathname: "/_next/static/media/geist.woff2", destination: "font" }), ORIGIN)).toBe("cache-first");
    expect(fetchPlan(probe({ pathname: "/logos/aapl.png", destination: "image" }), ORIGIN)).toBe("network-first");
    expect(fetchPlan(probe({ pathname: "/brand/maverlang-logo.png", destination: "image" }), ORIGIN)).toBe("network-first");
    expect(fetchPlan(probe({ pathname: "/manifest.webmanifest", destination: "manifest" }), ORIGIN)).toBe("network-first");

    const blocked = [
      "/api",
      "/api/prices",
      "/api/ai/chat",
      "/app",
      "/app/cartera",
      "/app/accion/AAPL",
      "/auth/callback",
      "/admin",
      "/bloqueado",
      "/dev/ui",
      "/_next/data/build/app.json",
      "/_next/image",
      "/sw.js",
    ];
    for (const pathname of blocked) {
      expect(fetchPlan(probe({ pathname }), ORIGIN)).toBe("bypass");
    }
  });

  it("no guarda navegaciones, otros orígenes, POST ni cargas de React Server Components", () => {
    expect(fetchPlan(probe({ pathname: "/logos/aapl.png", mode: "navigate", destination: "document" }), ORIGIN)).toBe("bypass");
    expect(fetchPlan(probe({ pathname: "/app/cartera", mode: "navigate", destination: "document" }), ORIGIN)).toBe("bypass");
    expect(fetchPlan(probe({ pathname: "/_next/static/chunks/app.js", method: "POST" }), ORIGIN)).toBe("bypass");
    expect(fetchPlan(probe({ pathname: "/_next/static/chunks/app.js", origin: "https://otro.example" }), ORIGIN)).toBe("bypass");
    expect(fetchPlan(probe({ pathname: "/_next/static/chunks/app.js", search: "?_rsc=abc" }), ORIGIN)).toBe("bypass");
    expect(fetchPlan(probe({ pathname: "/brand/notas.txt" }), ORIGIN)).toBe("bypass");
    expect(fetchPlan(probe({ pathname: "/application/logo.png" }), ORIGIN)).toBe("bypass");
    expect(shouldCacheStatic(probe({ pathname: "/api/me" }), ORIGIN)).toBe(false);
  });

  it("rechaza HTML, JSON, cookies, redirecciones y respuestas opacas", () => {
    const ok = {
      ok: true,
      status: 200,
      type: "basic",
      redirected: false,
      contentType: "image/png",
      setCookie: null,
    };
    expect(canStoreStaticResponse(ok)).toBe(true);
    expect(canStoreStaticResponse({ ...ok, contentType: "text/css; charset=utf-8" })).toBe(true);
    expect(canStoreStaticResponse({ ...ok, contentType: "application/javascript" })).toBe(true);
    expect(canStoreStaticResponse({ ...ok, contentType: "font/woff2" })).toBe(true);
    expect(canStoreStaticResponse({ ...ok, contentType: "text/html; charset=utf-8" })).toBe(false);
    expect(canStoreStaticResponse({ ...ok, contentType: "application/json" })).toBe(false);
    expect(canStoreStaticResponse({ ...ok, contentType: null })).toBe(false);
    expect(canStoreStaticResponse({ ...ok, setCookie: "session=1" })).toBe(false);
    expect(canStoreStaticResponse({ ...ok, redirected: true })).toBe(false);
    expect(canStoreStaticResponse({ ...ok, type: "opaque" })).toBe(false);
    expect(canStoreStaticResponse({ ...ok, status: 206 })).toBe(false);
    expect(canStoreStaticResponse({ ...ok, ok: false, status: 404 })).toBe(false);
  });
});

describe("instalación", () => {
  const base = {
    mobile: true,
    dismissed: false,
    standalone: false,
    ios: false,
    hasNativePrompt: false,
  };

  it("ofrece el aviso nativo, las instrucciones de iOS o nada", () => {
    expect(installOffer({ ...base, hasNativePrompt: true, ios: true })).toBe("native");
    expect(installOffer({ ...base, ios: true })).toBe("ios");
    expect(installOffer(base)).toBe("hidden");
    expect(installOffer({ ...base, hasNativePrompt: true, mobile: false })).toBe("hidden");
    expect(installOffer({ ...base, ios: true, dismissed: true })).toBe("hidden");
    expect(installOffer({ ...base, ios: true, standalone: true })).toBe("hidden");
    expect(shouldCaptureInstallPrompt({ mobile: true, dismissed: false, standalone: false })).toBe(true);
    expect(shouldCaptureInstallPrompt({ mobile: false, dismissed: false, standalone: false })).toBe(false);
  });

  it("reconoce iPhone, iPad y una app ya abierta en la pantalla de inicio", () => {
    expect(isIosHomeScreenDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 })).toBe(true);
    expect(isIosHomeScreenDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isIosHomeScreenDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
    expect(isIosHomeScreenDevice({ userAgent: "Mozilla/5.0 (Linux; Android 14)", platform: "Linux armv8l", maxTouchPoints: 5 })).toBe(false);
    expect(isInstalledDisplay({ standaloneMedia: true, navigatorStandalone: false })).toBe(true);
    expect(isInstalledDisplay({ standaloneMedia: false, navigatorStandalone: true })).toBe(true);
    expect(isInstalledDisplay({ standaloneMedia: false, navigatorStandalone: false })).toBe(false);
    expect(isInstallDismissed("1")).toBe(true);
    expect(isInstallDismissed(null)).toBe(false);
    expect(shouldRegisterServiceWorker("production")).toBe(true);
    expect(shouldRegisterServiceWorker("development")).toBe(false);
    expect(shouldRegisterServiceWorker(undefined)).toBe(false);
  });
});

describe("manifest y textos", () => {
  it("abre en /app, usa el ícono cuadrado existente y el wordmark público", () => {
    const mark = pngSize("app/icon.png");
    const wordmark = pngSize("public/brand/maverlang-logo.png");
    expect(mark.width).toBe(mark.height);
    expect(mark.width).toBeGreaterThanOrEqual(512);
    expect(`${wordmark.width}x${wordmark.height}`).toBe(PUBLIC_WORDMARK.sizes);

    const manifest = buildManifestFields({
      name: "Maverlang Stocks",
      description: "Descripción",
      markSrc: "/icon.png",
      markWidth: mark.width,
      markHeight: mark.height,
    });
    expect(manifest.name).toBe("Maverlang Stocks");
    expect(manifest.short_name).toBe("Maverlang");
    expect(manifest.start_url).toBe(PWA_START_URL);
    expect(manifest.scope).toBe(PWA_SCOPE);
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe(PWA_THEME_COLOR);
    expect(manifest.background_color).toBe("#ffffff");
    expect(manifest.lang).toBe("es-CL");
    expect(isStartInsideScope(String(manifest.start_url), String(manifest.scope))).toBe(true);
    expect(manifest.icons?.[0]).toMatchObject({ src: "/icon.png", sizes: "598x598", type: "image/png", purpose: "any" });
    expect(manifest.icons?.[1]).toMatchObject({ src: PUBLIC_WORDMARK.src, sizes: "1983x273", purpose: "any" });
    expect(pwaShortName("Marca")).toBe("Marca");
    expect(pwaShortName("ABCDEFGHIJKLMNOP")).toBe("ABCDEFGHIJKL");
  });

  it("el español nombra el gesto de iOS y no recomienda operar", () => {
    const esKeys = Object.keys(pwaExtra.esCL).sort();
    expect(Object.keys(pwaExtra.en).sort()).toEqual(esKeys);
    for (const key of esKeys) {
      const typed = key as keyof PwaCopy;
      expect(pwaExtra.esCL[typed].length).toBeGreaterThan(0);
      expect(pwaExtra.en[typed].length).toBeGreaterThan(0);
    }
    expect(pwaCopy("es-CL")).toBe(pwaExtra.esCL);
    expect(pwaCopy("en")).toBe(pwaExtra.en);
    expect(pwaExtra.esCL.iosBody).toBe("Compartir > Agregar a inicio.");
    expect(pwaExtra.esCL.install).toBe("Instalar app");
    const blob = `${JSON.stringify(pwaExtra.esCL)}\n${JSON.stringify(pwaExtra.en)}`;
    expect(blob).not.toMatch(ADVICE);
  });
});

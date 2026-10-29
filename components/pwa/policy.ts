/**
 * Decisiones puras de la app instalable: manifest, plataforma y si conviene
 * mostrar "Instalar app". El service worker vive en `public/sw.js`.
 */

import type { MetadataRoute } from "next";

export const PWA_THEME_COLOR = "#ffffff";
export const PWA_BACKGROUND_COLOR = "#ffffff";
export const PWA_START_URL = "/app";
export const PWA_SCOPE = "/";
export const PWA_LANG = "es-CL";
export const SERVICE_WORKER_URL = "/sw.js";
export const SERVICE_WORKER_SCOPE = "/";
export const PWA_DISMISS_KEY = "mv_pwa_install";
export const PWA_DISMISS_VALUE = "1";
export const PWA_DISMISS_EVENT = "mv-pwa-dismiss";

/** Wordmark ya publicado. No es cuadrado: no alcanza como ícono de inicio. */
export const PUBLIC_WORDMARK = {
  src: "/brand/maverlang-logo.png",
  sizes: "1983x273",
  type: "image/png",
} as const;

const SHORT_NAME_MAX = 12;

export function pwaShortName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length <= SHORT_NAME_MAX) return trimmed;
  const first = trimmed.split(" ")[0] ?? trimmed;
  if (first.length <= SHORT_NAME_MAX) return first;
  return first.slice(0, SHORT_NAME_MAX);
}

/** Sólo en producción: en `next dev` el cache interfiere con el recargado. */
export function shouldRegisterServiceWorker(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production";
}

export function isInstallDismissed(value: string | null): boolean {
  return value === PWA_DISMISS_VALUE;
}

export function isIosHomeScreenDevice(input: {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}): boolean {
  if (/iphone|ipad|ipod/i.test(input.userAgent)) return true;
  return input.platform === "MacIntel" && input.maxTouchPoints > 1;
}

export function isInstalledDisplay(input: {
  standaloneMedia: boolean;
  navigatorStandalone: boolean;
}): boolean {
  return input.standaloneMedia || input.navigatorStandalone;
}

export type InstallContext = {
  mobile: boolean;
  dismissed: boolean;
  standalone: boolean;
  ios: boolean;
  hasNativePrompt: boolean;
};

export type InstallOffer = "native" | "ios" | "hidden";

/** Chip sólo en el celular, y nunca si ya está instalada o la persona lo cerró. */
export function installOffer(input: InstallContext): InstallOffer {
  if (!input.mobile || input.dismissed || input.standalone) return "hidden";
  if (input.hasNativePrompt) return "native";
  if (input.ios) return "ios";
  return "hidden";
}

export function shouldCaptureInstallPrompt(input: {
  mobile: boolean;
  dismissed: boolean;
  standalone: boolean;
}): boolean {
  return input.mobile && !input.dismissed && !input.standalone;
}

export function isStartInsideScope(startUrl: string, scope: string): boolean {
  if (scope === "/") return startUrl.startsWith("/");
  const normalized = scope.endsWith("/") ? scope : `${scope}/`;
  return startUrl === scope || startUrl.startsWith(normalized);
}

type ManifestIcon = NonNullable<MetadataRoute.Manifest["icons"]>[number];

export function buildManifestFields(input: {
  name: string;
  description: string;
  markSrc: string;
  markWidth: number;
  markHeight: number;
}): MetadataRoute.Manifest {
  const icons: ManifestIcon[] = [];
  if (input.markWidth >= 192 && input.markHeight >= 192) {
    icons.push({
      src: input.markSrc,
      sizes: `${input.markWidth}x${input.markHeight}`,
      type: "image/png",
      purpose: "any",
    });
  }
  icons.push({
    src: PUBLIC_WORDMARK.src,
    sizes: PUBLIC_WORDMARK.sizes,
    type: PUBLIC_WORDMARK.type,
    purpose: "any",
  });
  return {
    name: input.name,
    short_name: pwaShortName(input.name),
    description: input.description,
    start_url: PWA_START_URL,
    scope: PWA_SCOPE,
    id: PWA_START_URL,
    display: "standalone",
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    lang: PWA_LANG,
    icons,
  };
}

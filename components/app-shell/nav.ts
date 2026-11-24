import { createElement, type ComponentType, type SVGProps } from "react";

import { navExtra, navExtraCopy } from "@/content/i18n/extra-nav";
import { en } from "@/content/i18n/en";
import { esCL, type Messages } from "@/content/i18n/es-CL";
import { IconChart, IconPortfolio, IconStar, IconUser, IconWallet } from "@/components/ui/icons";
import { isCredentialPath } from "@/lib/auth/paths";
import { cn } from "@/lib/cn";

/** Id del contenedor del dock de IA dentro del vidrio de la barra inferior (móvil). */
export const AI_DOCK_SLOT_ID = "mv-ai-dock-slot";

export type ShellSection = "market" | "portfolio" | "wallet" | "profile";

export type ShellTabId = "market" | "portfolio" | "assistant" | "favorites" | "wallet";

export type ShellNavId = ShellTabId | "profile" | "crypto";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

type Dest = {
  href: string;
  id: ShellNavId;
  icon: IconType;
  /** La barra inferior no lleva Perfil: queda en el menú de cuenta. */
  mobile: boolean;
};

/**
 * El sidebar lee `t.nav[id]` y no se edita aquí. Estas dos claves se publican
 * en los diccionarios al cargar el módulo, con el texto de extra-nav.
 */
function publishShellLabels(): void {
  const esNav = esCL.nav as Record<string, string>;
  const enNav = en.nav as Record<string, string>;
  esNav.assistant = navExtra.esCL.assistant;
  esNav.favorites = navExtra.esCL.favorites;
  esNav.crypto = "Cripto";
  enNav.assistant = navExtra.en.assistant;
  enNav.favorites = navExtra.en.favorites;
  enNav.crypto = "Crypto";
}

publishShellLabels();

function IconCrypto({ className, ...props }: SVGProps<SVGSVGElement>) {
  return createElement(
    "svg",
    {
      ...props,
      viewBox: "0 0 16 16",
      fill: "none",
      "aria-hidden": true,
      className: cn("size-4", className),
    },
    createElement("circle", {
      cx: 8,
      cy: 8,
      r: 5.5,
      stroke: "currentColor",
      strokeWidth: 1.5,
    }),
    createElement("path", {
      d: "M6.5 5.75h2.25a1.25 1.25 0 0 1 0 2.5H6.5m0 0h2.5a1.25 1.25 0 0 1 0 2.5H6.5m0-5v5",
      stroke: "currentColor",
      strokeWidth: 1.35,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    }),
  );
}

function IconAssistant({ className, ...props }: SVGProps<SVGSVGElement>) {
  return createElement(
    "svg",
    {
      ...props,
      viewBox: "0 0 16 16",
      fill: "none",
      "aria-hidden": true,
      className: cn("size-4", className),
    },
    createElement("path", {
      d: "M2.8 3.6h10.4A1.2 1.2 0 0 1 14.4 4.8v4.7a1.2 1.2 0 0 1-1.2 1.2H7.2L4.4 13.2V10.7H2.8a1.2 1.2 0 0 1-1.2-1.2V4.8a1.2 1.2 0 0 1 1.2-1.2Z",
      stroke: "currentColor",
      strokeWidth: 1.5,
      strokeLinejoin: "round",
    }),
  );
}

function IconFavorites({ className, ...props }: SVGProps<SVGSVGElement>) {
  return createElement(IconStar, { ...props, className: cn("size-4", className) });
}

/**
 * Un solo origen de rutas. La barra inferior toma cinco destinos en este orden
 * (Asistente al centro, la píldora se mueve por índice); el sidebar agrupa las
 * mismas filas por jerarquía: producto arriba, utilidades después.
 */
const marketDest = { href: "/app", id: "market", icon: IconChart, mobile: true } as const satisfies Dest;
const cryptoDest = { href: "/app/cripto", id: "crypto", icon: IconCrypto, mobile: false } as const satisfies Dest;
const portfolioDest = {
  href: "/app/cartera",
  id: "portfolio",
  icon: IconPortfolio,
  mobile: true,
} as const satisfies Dest;
const assistantDest = {
  href: "/app/asistente",
  id: "assistant",
  icon: IconAssistant,
  mobile: true,
} as const satisfies Dest;
const favoritesDest = {
  href: "/app/favoritas",
  id: "favorites",
  icon: IconFavorites,
  mobile: true,
} as const satisfies Dest;
const walletDest = { href: "/app/billetera", id: "wallet", icon: IconWallet, mobile: true } as const satisfies Dest;
const profileDest = { href: "/app/perfil", id: "profile", icon: IconUser, mobile: false } as const satisfies Dest;

const destinations = [
  marketDest,
  portfolioDest,
  assistantDest,
  favoritesDest,
  walletDest,
  profileDest,
] as const;

type DestItem = (typeof destinations)[number];

/** Todas las rutas del shell, en orden canónico (Mercado → Perfil). */
export const shellNav: readonly DestItem[] = destinations;

/** Columnas de la barra inferior: cinco destinos, Asistente al centro. */
export const mobileTabs = [marketDest, favoritesDest, assistantDest, portfolioDest, walletDest] as const;

/** Sidebar, grupo principal: el producto y el dinero. */
export const sidebarPrimary = [marketDest, cryptoDest, portfolioDest, walletDest] as const;

/** Sidebar, utilidades: lo personal y el asistente. */
export const sidebarUtility = [favoritesDest, assistantDest] as const;

export function shellTabLabel(
  language: "es-CL" | "en",
  id: ShellNavId,
  nav: Pick<Messages["nav"], "market" | "portfolio" | "wallet"> & { profile?: string },
): string {
  if (id === "assistant" || id === "favorites") return navExtraCopy(language)[id];
  if (id === "crypto") return language === "en" ? "Crypto" : "Cripto";
  if (id === "profile") return nav.profile ?? (language === "en" ? "Profile" : "Perfil");
  return nav[id];
}

/** Rutas que dependen de la pestaña Mercado (acciones, Copiar y herramientas de mercado). */
const MARKET_PATHS = ["/app/accion", "/app/copiar", "/app/screener", "/app/comparar", "/app/mix", "/app/alertas"] as const;

/** Rutas que dependen de la sección Cripto (Tokens y Ganar). */
const CRYPTO_PATHS = ["/app/cripto"] as const;

export function isShellSectionActive(pathname: string, id: string): boolean {
  if (id === "market") {
    if (pathname === "/app") return true;
    return MARKET_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`));
  }
  if (id === "crypto") {
    return CRYPTO_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`));
  }
  const href = destinations.find((item) => item.id === id)?.href;
  if (!href) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Índice de la pestaña activa. -1 si la ruta no es una de las cinco. */
export function activeMobileTab(pathname: string): number {
  // Crypto has its own desktop destination and belongs to Market on mobile.
  if (isShellSectionActive(pathname, "crypto")) return mobileTabs.findIndex((item) => item.id === "market");
  return mobileTabs.findIndex((item) => isShellSectionActive(pathname, item.id));
}

/**
 * Oculta la barra al bajar y la muestra al subir. En el tope queda visible.
 * Un movimiento menor al umbral no cambia el estado.
 */
export function nextTabBarHidden(hidden: boolean, previousY: number, nextY: number): boolean {
  if (nextY <= 8) return false;
  const delta = nextY - previousY;
  if (delta > 12 && nextY > 48) return true;
  if (delta < -12) return false;
  return hidden;
}

/** Rutas de /app que no llevan sidebar ni tabs. */
export function isBarePlatformPath(pathname: string): boolean {
  if (isCredentialPath(pathname)) return true;
  return pathname === "/app/onboarding" || pathname.startsWith("/app/onboarding/");
}

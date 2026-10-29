import { createElement, type ComponentType, type SVGProps } from "react";

import { navExtra, navExtraCopy } from "@/content/i18n/extra-nav";
import { en } from "@/content/i18n/en";
import { esCL, type Messages } from "@/content/i18n/es-CL";
import { IconChart, IconPortfolio, IconStar, IconUser, IconWallet } from "@/components/ui/icons";
import { isCredentialPath } from "@/lib/auth/paths";
import { cn } from "@/lib/cn";

export type ShellSection = "market" | "portfolio" | "wallet" | "profile";

export type ShellTabId = "market" | "portfolio" | "assistant" | "favorites" | "wallet";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

type Dest = {
  href: string;
  id: ShellTabId | "profile";
  icon: IconType;
  /** La barra inferior no lleva Perfil: queda en la barra superior. */
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
  enNav.assistant = navExtra.en.assistant;
  enNav.favorites = navExtra.en.favorites;
}

publishShellLabels();

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

const destinations = [
  { href: "/app", id: "market", icon: IconChart, mobile: true },
  { href: "/app/cartera", id: "portfolio", icon: IconPortfolio, mobile: true },
  { href: "/app/asistente", id: "assistant", icon: IconAssistant, mobile: true },
  { href: "/app/favoritas", id: "favorites", icon: IconFavorites, mobile: true },
  { href: "/app/billetera", id: "wallet", icon: IconWallet, mobile: true },
  { href: "/app/perfil", id: "profile", icon: IconUser, mobile: false },
] as const satisfies readonly Dest[];

type DestItem = (typeof destinations)[number];

/**
 * Mismo arreglo que consume el sidebar. El tipo queda en las secciones que
 * `t.nav` ya tenía: Perfil se filtra allá, y Asistente entra por este arreglo.
 */
export const shellNav = destinations as unknown as readonly {
  href: string;
  id: ShellSection;
  icon: IconType;
}[];

export const mobileTabs = destinations.filter(
  (item): item is Extract<DestItem, { mobile: true }> => item.mobile,
);

export function shellTabLabel(
  language: "es-CL" | "en",
  id: (typeof mobileTabs)[number]["id"],
  nav: Pick<Messages["nav"], "market" | "portfolio" | "wallet">,
): string {
  if (id === "assistant" || id === "favorites") return navExtraCopy(language)[id];
  return nav[id];
}

export function isShellSectionActive(pathname: string, id: string): boolean {
  if (id === "market") {
    return pathname === "/app" || pathname === "/app/accion" || pathname.startsWith("/app/accion/");
  }
  const href = destinations.find((item) => item.id === id)?.href;
  if (!href) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Índice de la pestaña activa. -1 si la ruta no es una de las cinco. */
export function activeMobileTab(pathname: string): number {
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

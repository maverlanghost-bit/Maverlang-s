import type { ComponentType, SVGProps } from "react";

import { IconChart, IconPortfolio, IconUser, IconWallet } from "@/components/ui/icons";

export type ShellSection = "market" | "portfolio" | "wallet" | "profile";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export const shellNav: readonly { href: string; id: ShellSection; icon: IconType }[] = [
  { href: "/app", id: "market", icon: IconChart },
  { href: "/app/cartera", id: "portfolio", icon: IconPortfolio },
  { href: "/app/billetera", id: "wallet", icon: IconWallet },
  { href: "/app/perfil", id: "profile", icon: IconUser },
];

export function isShellSectionActive(pathname: string, id: ShellSection): boolean {
  if (id === "market") return pathname === "/app" || pathname === "/app/accion" || pathname.startsWith("/app/accion/");
  const href = shellNav.find((item) => item.id === id)?.href ?? "";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Rutas de /app que no llevan sidebar ni tabs. */
const BARE = ["/app/ingresar", "/app/onboarding", "/app/registro"] as const;

export function isBarePlatformPath(pathname: string): boolean {
  return BARE.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

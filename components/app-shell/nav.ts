import type { ComponentType, SVGProps } from "react";

import { isCredentialPath } from "@/lib/auth/paths";
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
export function isBarePlatformPath(pathname: string): boolean {
  if (isCredentialPath(pathname)) return true;
  return pathname === "/app/onboarding" || pathname.startsWith("/app/onboarding/");
}

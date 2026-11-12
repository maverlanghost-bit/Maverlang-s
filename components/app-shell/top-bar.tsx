"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAccountLabel } from "@/components/app-shell/account-label";
import { CommandPalette } from "@/components/app-shell/command-palette";
import { CurrencySwitch } from "@/components/app-shell/currency-switch";
import { StockSearchButton } from "@/components/app-shell/stock-search";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountMode } from "@/lib/account/mode";
import { useT } from "@/lib/hooks/use-t";

/**
 * Barra superior del shell, una sola pieza y sin protagonismo:
 * - Móvil: barra fija con el buscador a lo ancho, la moneda y la cuenta.
 * - Escritorio: barra pegajosa sobre el contenido con el buscador y la moneda.
 *   La cuenta vive en el pie del sidebar, junto al saldo y al conmutador demo/real.
 *
 * El aviso de cuenta demo sigue siendo un punto sobre el avatar (el texto va en
 * aria-label): mismo aviso, misma frase.
 *
 * `hideMobileCluster` oculta la barra móvil en rutas donde el chat de IA ya
 * trae su propia navegación superior; la barra de escritorio también se retira
 * en /app/asistente para no alterar esa pantalla. La paleta sigue disponible.
 */
export function TopBar({
  accountMode = "demo",
  hideMobileCluster = false,
}: {
  accountMode?: AccountMode;
  hideMobileCluster?: boolean;
}) {
  const { t } = useT();
  const pathname = usePathname();
  const account = useAccountLabel();
  const assistantRoute = pathname === "/app/asistente" || pathname.startsWith("/app/asistente/");
  const base = account.loading ? t.shell.account : `${account.name}. ${t.shell.account}`;
  const label = accountMode === "demo" ? `${base}. ${t.account.badge}` : base;

  return (
    <>
      {hideMobileCluster ? null : (
        <div className="fixed inset-x-0 top-0 z-30 border-b border-border/70 bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-5">
            <div className="min-w-0 flex-1">
              <StockSearchButton />
            </div>
            <CurrencySwitch compact />
            <Link
              href="/app/perfil"
              aria-label={label}
              className="relative flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-surface-2"
            >
              {account.loading ? (
                <Skeleton className="size-8 rounded-full" />
              ) : (
                <Avatar alt="" fallback={account.name} size="md" className="size-8 ring-1 ring-border" />
              )}
              {accountMode === "demo" ? (
                <span aria-hidden className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-warn ring-2 ring-bg" />
              ) : null}
            </Link>
          </div>
        </div>
      )}
      {assistantRoute ? null : (
        <div className="sticky top-0 z-20 hidden border-b border-border/70 bg-bg/85 backdrop-blur-xl lg:block">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-8 py-2">
            <div className="w-full max-w-[22rem] min-w-0">
              <StockSearchButton />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <CurrencySwitch compact />
            </div>
          </div>
        </div>
      )}
      <CommandPalette />
    </>
  );
}

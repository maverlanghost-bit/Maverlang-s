"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccountLabel } from "@/components/app-shell/account-label";
import { CurrencySwitch } from "@/components/app-shell/currency-switch";
import { StockSearchButton } from "@/components/app-shell/stock-search";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { Messages } from "@/content/i18n/es-CL";
import type { AccountMode } from "@/lib/account/mode";
import { useT } from "@/lib/hooks/use-t";

/** Título contextual de la sección actual, como los brokers nativos. */
function sectionTitle(pathname: string, t: Messages): string {
  const action = pathname.match(/^\/app\/accion\/([^/]+)/);
  if (action) return decodeURIComponent(action[1] ?? "");
  if (pathname === "/app") return t.nav.market;
  if (pathname.startsWith("/app/cartera")) return t.nav.portfolio;
  if (pathname.startsWith("/app/billetera")) return t.nav.wallet;
  if (pathname.startsWith("/app/perfil")) return t.nav.profile;
  if (pathname.startsWith("/app/ajustes")) return t.nav.settings;
  return t.nav.market;
}

/**
 * Barra superior móvil estilo broker nativo, una sola intención por zona:
 *  - Izquierda: perfil (avatar + título de la sección + insignia Demo).
 *  - Derecha: moneda y buscar.
 * Sin logo ancho (pedido del fundador): el título de la sección ocupa su
 * lugar, como en las apps de broker de primera línea.
 */
export function TopBar({ accountMode = "demo" }: { accountMode?: AccountMode }) {
  const { t } = useT();
  const pathname = usePathname();
  const account = useAccountLabel();
  const title = sectionTitle(pathname, t);

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
      <div className="flex min-h-14 items-center gap-2 py-2">
        <Link
          href="/app/perfil"
          aria-label={account.loading ? t.shell.account : `${account.name}. ${t.shell.account}`}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none transition duration-140 ease-spring hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]"
        >
          {account.loading ? (
            <Skeleton className="size-8 rounded-full" />
          ) : (
            <Avatar alt="" fallback={account.name} size="md" className="size-8 ring-1 ring-border/80" />
          )}
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-fg">
            {title}
          </span>
          {accountMode === "demo" ? (
            <Badge tone="warn" className="shrink-0 px-2 py-0 text-[11px]">
              {t.account.badge}
            </Badge>
          ) : null}
        </div>
        <CurrencySwitch compact className="shrink-0" />
        <StockSearchButton variant="icon" />
      </div>
    </header>
  );
}

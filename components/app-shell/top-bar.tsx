"use client";

import { useAccountLabel } from "@/components/app-shell/account-label";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { BalanceHeader } from "@/components/domain/balance-header";
import { Badge } from "@/components/ui/badge";
import type { AccountMode } from "@/lib/account/mode";
import { useT } from "@/lib/hooks/use-t";

export function TopBar({ accountMode = "demo" }: { accountMode?: AccountMode }) {
  const { t } = useT();
  const account = useAccountLabel();
  const identity = account.loading ? "" : account.email ? `${account.name} · ${account.email}` : account.name;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 px-5 backdrop-blur-md pt-[env(safe-area-inset-top)] lg:hidden">
      <div className="flex min-h-14 items-center gap-3 py-2">
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <BrandMark />
            {accountMode === "demo" ? <Badge tone="warn">{t.account.badge}</Badge> : null}
          </span>
          {identity ? <p className="truncate pl-4 text-xs leading-4 text-fg-muted">{identity}</p> : null}
        </div>
        <BalanceHeader variant="bar" className="min-w-0 max-w-[58%]" />
      </div>
    </header>
  );
}

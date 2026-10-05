"use client";

import { BrandMark } from "@/components/app-shell/brand-mark";
import { BalanceHeader } from "@/components/domain/balance-header";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 px-5 backdrop-blur-md pt-[env(safe-area-inset-top)] lg:hidden">
      <div className="flex h-14 items-center gap-3">
        <BrandMark className="min-w-0 flex-1" />
        <BalanceHeader variant="bar" className="min-w-0 max-w-[58%]" />
      </div>
    </header>
  );
}

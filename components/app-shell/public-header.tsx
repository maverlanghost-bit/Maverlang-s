"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { BrandMark } from "@/components/app-shell/brand-mark";
import { StockSearchButton } from "@/components/app-shell/stock-search";
import { CurrencySwitch } from "@/components/app-shell/currency-switch";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IconMenu } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { ingresarPath, registroPath, safeNextPath } from "@/lib/auth/paths";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

function useHere(): string {
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const next = search ? `${pathname}?${search}` : pathname;
  return safeNextPath(next) ?? pathname;
}

function PublicHeaderBar({ here }: { here: string }) {
  const { t } = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const enter = ingresarPath(here);
  const create = registroPath(here);
  const marketCurrent = pathname === "/app" || pathname.startsWith("/app/accion");

  const links = [
    { href: "/app", label: t.nav.market, current: marketCurrent },
    { href: "/ayuda", label: t.guest.help, current: false },
  ] as const;

  return (
    <header className="sticky top-0 z-30 overflow-x-clip border-b border-border/70 bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-1 px-3 min-[400px]:px-5">
        <BrandMark compactOnMobile className="min-w-0 shrink" />
        <nav aria-label={t.guest.nav} className="ml-5 hidden items-center gap-0.5 md:flex">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                item.current
                  ? "bg-surface-1 text-fg"
                  : "text-fg-muted hover:bg-surface-1 hover:text-fg",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1 min-[400px]:gap-1.5">
          <StockSearchButton variant="icon" />
          <CurrencySwitch compact className="mr-1 hidden min-[560px]:inline-flex" />
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-11 shrink-0 rounded-full px-1.5 text-[13px] whitespace-nowrap min-[400px]:px-2.5 min-[400px]:text-sm"
          >
            <Link href={enter}>{t.guest.login}</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="h-11 shrink-0 rounded-full px-2 text-[13px] whitespace-nowrap min-[400px]:px-4 min-[400px]:text-sm"
          >
            <Link href={create}>{t.guest.signup}</Link>
          </Button>
          <IconButton
            label={open ? t.guest.closeMenu : t.guest.openMenu}
            size="md"
            className="md:hidden"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <IconMenu />
          </IconButton>
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen} title={t.guest.menu}>
        <nav aria-label={t.guest.nav} className="flex flex-col divide-y divide-border">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={cn(
                "flex h-12 min-h-11 items-center px-1 text-[15px] transition-colors",
                item.current ? "font-medium text-fg" : "text-fg-body hover:text-fg",
              )}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-5 flex justify-center">
          <CurrencySwitch />
        </div>
      </Sheet>
    </header>
  );
}

function PublicHeaderLive() {
  return <PublicHeaderBar here={useHere()} />;
}

export function PublicHeader() {
  const pathname = usePathname();
  return (
    <Suspense fallback={<PublicHeaderBar here={pathname} />}>
      <PublicHeaderLive />
    </Suspense>
  );
}

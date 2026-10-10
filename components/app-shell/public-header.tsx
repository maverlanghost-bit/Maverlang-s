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
    <header className="sticky top-0 z-30 overflow-x-clip border-b border-border bg-bg/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-1.5 px-3 min-[400px]:px-5">
        <BrandMark className="min-w-0 shrink" />
        <nav aria-label={t.guest.nav} className="ml-3 hidden items-center gap-1 md:flex">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-2 text-sm whitespace-nowrap outline-none focus-visible:ring-4 focus-visible:ring-fg/20",
                item.current ? "font-medium text-fg" : "text-fg-body hover:text-fg",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <StockSearchButton variant="icon" />
          <CurrencySwitch className="mr-1 hidden min-[400px]:inline-flex" />
          <Button asChild variant="ghost" size="sm" className="h-11 shrink-0 px-2 text-sm whitespace-nowrap">
            <Link href={enter}>{t.guest.login}</Link>
          </Button>
          <Button asChild size="sm" className="h-11 shrink-0 px-2.5 text-sm whitespace-nowrap">
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
        <nav aria-label={t.guest.nav} className="flex flex-col">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className="flex h-12 min-h-11 items-center rounded-xl px-3 text-base text-fg outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 flex justify-center">
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

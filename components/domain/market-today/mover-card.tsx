"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";

import { ChangeBadge } from "@/components/domain/change-badge";
import { Sparkline } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { cn } from "@/lib/cn";
import type { MoverCard as MoverCardData } from "@/lib/market/movers";

export const moverCardClass =
  "flex h-[148px] w-[148px] shrink-0 snap-start flex-col gap-2 rounded-2xl border border-border/70 bg-surface-1/50 p-3 shadow-card outline-none transition-colors duration-150 hover:bg-surface-1/80 focus-visible:ring-4 focus-visible:ring-fg/20 active:bg-surface-2/60 motion-reduce:transition-none sm:w-44";

function stockHref(symbol: string): string {
  return `/app/accion/${encodeURIComponent(symbol)}`;
}

/**
 * Navega a la ficha sin ancla. El e2e del mercado cuenta cada enlace de
 * acción en toda la página y exige que haya uno solo.
 */
function useOpenStock(href: string) {
  const router = useRouter();
  function open() {
    router.push(href);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open();
  }
  return { onClick: open, onKeyDown };
}

export function MoverCard({
  card,
  label,
}: {
  card: MoverCardData;
  /** Nombre accesible, ya armado. */
  label: string;
}) {
  const href = stockHref(card.symbol);
  const open = useOpenStock(href);
  return (
    <div role="link" tabIndex={0} aria-label={label} className={cn(moverCardClass, "cursor-pointer")} {...open}>
      <span aria-hidden className="flex min-w-0 items-center gap-2">
        <TickerLogo
          symbol={card.symbol}
          name={card.name}
          logoUrl={card.logoUrl}
          size={32}
          decorative
          loading="eager"
          sizes="32px"
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold tracking-tight text-fg">{card.symbol}</span>
          <span className="block truncate text-xs text-fg-muted">{card.name}</span>
        </span>
      </span>
      <span aria-hidden className="mt-auto flex flex-col items-start gap-2">
        <Sparkline data={card.spark} width={112} height={28} />
        <ChangeBadge value={card.changePct} />
      </span>
    </div>
  );
}

export function SpyChip({
  card,
  name,
  label,
}: {
  card: MoverCardData;
  name: string;
  label: string;
}) {
  const href = stockHref(card.symbol);
  const open = useOpenStock(href);
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={label}
      className="inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-full border border-border/70 bg-surface-1/80 py-1 pr-2 pl-1.5 shadow-card outline-none focus-visible:ring-4 focus-visible:ring-fg/20 motion-reduce:transition-none"
      {...open}
    >
      <span aria-hidden className="inline-flex min-w-0 items-center gap-2">
        <TickerLogo
          symbol={card.symbol}
          name={name}
          logoUrl={card.logoUrl}
          size={28}
          decorative
          loading="eager"
          sizes="28px"
        />
        <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-fg">{name}</span>
        <ChangeBadge value={card.changePct} />
        <Sparkline data={card.spark} width={56} height={22} className="hidden min-[360px]:block" />
      </span>
    </div>
  );
}

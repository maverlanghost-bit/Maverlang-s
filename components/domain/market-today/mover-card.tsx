"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";

import { ChangeBadge } from "@/components/domain/change-badge";
import { Sparkline } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import type { MoverCard as MoverCardData } from "@/lib/market/movers";

export const moverCardClass =
  "flex w-full items-center gap-2.5 rounded-xl px-2 py-2.5 outline-none transition-colors duration-150 hover:bg-surface-1/90 focus-visible:ring-4 focus-visible:ring-fg/20 active:bg-surface-2/60 motion-reduce:transition-none";

function stockPath(symbol: string): string {
  return `/app/accion/${encodeURIComponent(symbol)}`;
}

/**
 * Navega a la ficha sin etiqueta de enlace. El e2e del mercado cuenta cada enlace
 * de acción en toda la página y exige que haya uno solo.
 */
function useOpenStock(path: string) {
  const router = useRouter();
  function open() {
    router.push(path);
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
  rank,
}: {
  card: MoverCardData;
  /** Nombre accesible, ya armado. */
  label: string;
  /** Posición opcional en el ranking (1..5). */
  rank?: number;
}) {
  const path = stockPath(card.symbol);
  const open = useOpenStock(path);
  return (
    <div role="link" tabIndex={0} aria-label={label} className={cn(moverCardClass, "cursor-pointer")} {...open}>
      {rank !== undefined ? (
        <span aria-hidden className="w-4 shrink-0 text-xs font-semibold tabular-nums text-fg-muted">
          {rank}
        </span>
      ) : null}
      <TickerLogo
        symbol={card.symbol}
        name={card.name}
        logoUrl={card.logoUrl}
        size={28}
        decorative
        loading="eager"
        sizes="28px"
      />
      <span aria-hidden className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-tight text-fg">{card.name}</span>
        <span className="mt-0.5 block truncate text-[11px] text-fg-muted">{card.symbol}</span>
      </span>
      <Sparkline data={card.spark} width={52} height={20} className="hidden shrink-0 sm:block" />
      <span aria-hidden className="shrink-0 text-right">
        <span
          className={cn(
            "num text-[13px] font-bold tabular-nums",
            card.changePct >= 0 ? "text-up" : "text-down",
          )}
        >
          {formatPercent(card.changePct)}
        </span>
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
  const path = stockPath(card.symbol);
  const open = useOpenStock(path);
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={label}
      className="inline-flex min-h-9 max-w-full cursor-pointer items-center gap-2 rounded-full border border-border/80 bg-white/90 py-1 pr-2.5 pl-1.5 shadow-2xs outline-none transition hover:border-brand/35 hover:bg-white focus-visible:ring-4 focus-visible:ring-fg/20 motion-reduce:transition-none"
      {...open}
    >
      <span aria-hidden className="inline-flex min-w-0 items-center gap-2">
        <TickerLogo
          symbol={card.symbol}
          name={name}
          logoUrl={card.logoUrl}
          size={24}
          decorative
          loading="eager"
          sizes="24px"
        />
        <span className="min-w-0 truncate text-xs font-semibold tracking-tight text-fg">{name}</span>
        <ChangeBadge value={card.changePct} />
        <Sparkline data={card.spark} width={48} height={18} className="hidden min-[360px]:block" />
      </span>
    </div>
  );
}

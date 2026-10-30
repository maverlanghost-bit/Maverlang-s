"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { TickerLogo } from "@/components/domain/ticker-logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { cn } from "@/lib/cn";
import { formatDateTime, formatShares } from "@/lib/format";
import type { Activity, Ticker } from "@/lib/types";

export type WalletActivity = Activity & {
  amountUsd?: number | null;
  amountClp?: number | null;
  shares?: number | null;
  createdAt?: string;
  txSignature?: string | null;
};

type FilterKey = "all" | "buy" | "sell" | "deposit";

function resolveUsd(item: WalletActivity): number | null {
  const raw = item.valueUsd ?? item.amountUsd ?? null;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function resolveShares(item: WalletActivity): number {
  const raw = item.shares ?? item.amountUi ?? 0;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

function resolveTimestamp(item: WalletActivity): string {
  return item.createdAt ?? item.at;
}

function resolveSignature(item: WalletActivity): string | null {
  return item.txSignature ?? item.signature ?? null;
}

function formatRelativeShort(iso: string, lang: "es-CL" | "en"): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "—";
  const diffMs = Date.now() - parsed;
  const diffMin = Math.max(0, Math.floor(diffMs / 60_000));
  if (diffMin < 1) return lang === "en" ? "Just now" : "Hace instantes";
  if (diffMin < 60) return lang === "en" ? `${diffMin}m ago` : `Hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return lang === "en" ? `${diffHours}h ago` : `Hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return lang === "en" ? `${diffDays}d ago` : `Hace ${diffDays} d`;
  return formatDateTime(iso);
}

export function InvestmentHistory({
  items,
  loading = false,
  lang,
  formatUsdValue,
  formatClpValue,
  displayCurrency,
  fxRate,
  masked = false,
  tickersBySymbol,
}: {
  items: readonly WalletActivity[];
  loading?: boolean;
  lang: "es-CL" | "en";
  formatUsdValue: (usd: number) => string;
  formatClpValue: (clp: number) => string;
  displayCurrency: "CLP" | "USD";
  fxRate?: number;
  masked?: boolean;
  tickersBySymbol?: ReadonlyMap<string, Ticker>;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const isEn = lang === "en";

  const filters: { id: FilterKey; label: string }[] = isEn
    ? [
        { id: "all", label: "All" },
        { id: "buy", label: "Buys" },
        { id: "sell", label: "Sells" },
        { id: "deposit", label: "Deposits" },
      ]
    : [
        { id: "all", label: "Todas" },
        { id: "buy", label: "Compras" },
        { id: "sell", label: "Ventas" },
        { id: "deposit", label: "Depósitos" },
      ];

  const { tradesCount, buyVolumeUsd, latestAt } = useMemo(() => {
    let trades = 0;
    let buySum = 0;
    let newest = "";
    let newestMs = -Infinity;

    for (const item of items) {
      if (item.kind === "buy" || item.kind === "sell") trades += 1;
      if (item.kind === "buy") {
        const usd = resolveUsd(item);
        if (usd !== null && usd > 0) buySum += usd;
      }
      const ts = resolveTimestamp(item);
      const ms = Date.parse(ts);
      if (Number.isFinite(ms) && ms > newestMs) {
        newestMs = ms;
        newest = ts;
      }
    }
    return {
      tradesCount: trades,
      buyVolumeUsd: buySum,
      latestAt: newest ? formatRelativeShort(newest, lang) : "—",
    };
  }, [items, lang]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "deposit") {
      return items.filter((item) => item.kind === "deposit" || item.kind === "onramp" || item.kind === "receive");
    }
    return items.filter((item) => item.kind === filter);
  }, [items, filter]);

  const formatPrimary = (item: WalletActivity): string => {
    if (masked) return "••••••";
    const usd = resolveUsd(item);
    if (displayCurrency === "CLP") {
      if (typeof item.amountClp === "number" && Number.isFinite(item.amountClp)) {
        return formatClpValue(item.amountClp);
      }
      if (usd !== null && typeof fxRate === "number" && Number.isFinite(fxRate) && fxRate > 0) {
        return formatClpValue(usd * fxRate);
      }
    }
    if (usd !== null) return formatUsdValue(usd);
    return `${formatShares(resolveShares(item))} ${item.symbol}`;
  };

  const formatSecondary = (item: WalletActivity): string | null => {
    if (masked) return null;
    const usd = resolveUsd(item);
    const shares = resolveShares(item);
    if (displayCurrency === "CLP" && usd !== null) {
      return formatUsdValue(usd);
    }
    if (displayCurrency === "USD" && usd !== null && typeof fxRate === "number" && Number.isFinite(fxRate) && fxRate > 0) {
      return formatClpValue(usd * fxRate);
    }
    if ((item.kind === "buy" || item.kind === "sell") && usd !== null && shares > 0) {
      return `${formatUsdValue(usd / shares)} / acc.`;
    }
    return null;
  };

  return (
    <section
      aria-label={isEn ? "Investment history" : "Historial de inversiones"}
      className="rounded-2xl border border-border/80 bg-bg-elevated/95 p-4 shadow-[0_12px_34px_-16px_rgba(12,15,20,0.08)] md:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-fg">
            {isEn ? "Investment history" : "Historial de inversiones"}
          </h2>
          <p className="text-xs text-fg-muted">
            {isEn
              ? "Record of your stock purchases, sales, and wallet movements."
              : "Registro detallado de tus compras, ventas y movimientos de saldo."}
          </p>
        </div>

        <div
          role="tablist"
          aria-label={isEn ? "Filter operations" : "Filtrar operaciones"}
          className="inline-flex flex-wrap items-center gap-1 self-start rounded-full border border-border/80 bg-surface-2/80 p-1 backdrop-blur-md sm:self-auto"
        >
          {filters.map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tab.id)}
                className={cn(
                  "min-h-8 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 outline-none focus-visible:ring-4 focus-visible:ring-fg/20",
                  active
                    ? "bg-bg-elevated text-fg shadow-xs"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5 rounded-xl border border-border/70 bg-surface-2/55 p-3 tabular-nums">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-fg-muted">
            {isEn ? "Total trades" : "Total operaciones"}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-fg sm:text-base">{tradesCount}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-fg-muted">
            {isEn ? "Invested volume" : "Volumen en compras"}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-fg sm:text-base">
            {masked
              ? "••••••"
              : displayCurrency === "CLP" && typeof fxRate === "number" && fxRate > 0
                ? formatClpValue(buyVolumeUsd * fxRate)
                : formatUsdValue(buyVolumeUsd)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-fg-muted">
            {isEn ? "Last activity" : "Última operación"}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-fg sm:text-base">{latestAt}</p>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex flex-col gap-2.5" role="status" aria-live="polite" aria-busy="true">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-surface-1/60 px-4 py-8 text-center">
            <p className="text-sm font-medium text-fg">
              {isEn
                ? "You have no recorded investments in this filter yet."
                : "Aún no registras inversiones en este filtro."}
            </p>
            <p className="mt-1 max-w-xs text-xs text-fg-muted">
              {isEn
                ? "Start buying fractions of tokenized U.S. stocks from $1,000 CLP."
                : "Compra fracciones de acciones de EE. UU. y sigue cada orden aquí."}
            </p>
            <Button asChild size="sm" className="mt-3 min-h-9 rounded-full px-4">
              <Link href="/app">{isEn ? "Explore stocks" : "Explorar acciones"}</Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filteredItems.map((item) => {
              const ticker = tickersBySymbol?.get(item.symbol);
              const isStock = item.symbol && item.symbol !== "USDC" && item.symbol !== "SOL";
              const logoUrl = isStock ? (ticker?.logo || logoPathFromSymbol(item.symbol)) : null;
              const shares = resolveShares(item);
              const ts = resolveTimestamp(item);
              const sig = resolveSignature(item);
              const secondary = formatSecondary(item);
              const confirmed = item.status === "confirmed";

              const badgeConfig =
                item.kind === "buy"
                  ? { label: isEn ? "Buy" : "Compra", cls: "bg-up-bg text-up border-up/25" }
                  : item.kind === "sell"
                    ? { label: isEn ? "Sell" : "Venta", cls: "bg-down-bg text-down border-down/25" }
                    : item.kind === "deposit" || item.kind === "onramp" || item.kind === "receive"
                      ? { label: isEn ? "Deposit" : "Depósito", cls: "bg-brand-soft/75 text-brand border-brand/25" }
                      : { label: isEn ? "Transfer" : "Envío", cls: "bg-surface-2 text-fg-muted border-border" };

              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-3.5 first:pt-1 last:pb-1"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {isStock ? (
                      <TickerLogo
                        symbol={item.symbol}
                        name={ticker?.name ?? item.symbol}
                        logoUrl={logoUrl}
                        size={38}
                        loading="lazy"
                        sizes="38px"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="inline-flex size-9.5 shrink-0 items-center justify-center rounded-full border border-brand/25 bg-brand-soft/60 text-xs font-bold text-brand"
                      >
                        $
                      </span>
                    )}

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            badgeConfig.cls,
                          )}
                        >
                          {badgeConfig.label}
                        </span>
                        <span className="truncate text-sm font-semibold text-fg">
                          {ticker?.name ?? item.symbol}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs tabular-nums text-fg-muted">
                        {isStock ? `${formatShares(shares)} ${item.symbol} · ` : ""}
                        <time dateTime={ts}>{formatDateTime(ts)}</time>
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right tabular-nums">
                    <p className="text-sm font-semibold text-fg">{formatPrimary(item)}</p>
                    {secondary ? <p className="text-xs text-fg-muted">{secondary}</p> : null}
                    <div className="mt-0.5 inline-flex items-center justify-end gap-1.5 text-[11px] text-fg-muted">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-1.5 rounded-full",
                          confirmed ? "bg-up" : item.status === "failed" ? "bg-down" : "bg-warn",
                        )}
                      />
                      <span>
                        {confirmed
                          ? isEn
                            ? "Completed"
                            : "Completada"
                          : item.status === "failed"
                            ? isEn
                              ? "Failed"
                              : "Fallida"
                            : isEn
                              ? "In progress"
                              : "En proceso"}
                      </span>
                      {sig ? (
                        <a
                          href={`https://solscan.io/tx/${encodeURIComponent(sig)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-brand underline-offset-2 hover:underline"
                        >
                          Solscan
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

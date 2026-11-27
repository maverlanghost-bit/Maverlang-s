"use client";

import Link from "next/link";

import { HideBalanceToggle } from "@/components/domain/hide-balance-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatMoney, formatPercent } from "@/lib/format";
import { useAccountMode } from "@/lib/hooks/use-account-mode";
import { useHideBalance } from "@/lib/hooks/use-hide-balance";
import { useFx, usePortfolio } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";
import type { Currency } from "@/lib/types";

/**
 * Encabezado de saldo del Mercado: rótulo, monto grande y resultado total de
 * la cartera. Sin tarjeta en la versión con sesión. El ojo oculta los montos con
 * la misma preferencia por usuario que la barra lateral (`useHideBalance`).
 * `variant="desktop"` agranda el monto (48px) y alinea el bloque de invitado
 * a la izquierda, sin caja. No hay serie histórica del saldo en los hooks, así
 * que no hay mini gráfico.
 */

const MASK = "••••••";

function shown(usd: number, currency: Currency, rate: number | undefined): string {
  if (currency === "CLP" && rate !== undefined) return formatMoney(usd * rate, "CLP");
  return formatMoney(usd, "USD");
}

export function MobileBalanceCard({ className, variant = "mobile" }: { className?: string; variant?: "mobile" | "desktop" }) {
  const desktop = variant === "desktop";
  const { t, currency, language } = useT();
  const en = language === "en";
  const { hidden, userId } = useHideBalance();
  const { mode } = useAccountMode();
  const portfolio = usePortfolio();
  const fx = useFx();

  if (!userId) {
    return (
      <section
        aria-label={en ? "Your balance" : "Tu saldo"}
        className={cn(desktop ? "" : "rounded-[28px] border border-border bg-surface-1 p-5", className)}
      >
        <p className="text-[15px] leading-5 text-fg-muted">{en ? "Your balance" : "Tu saldo"}</p>
        <p className={cn("mt-1 font-semibold tracking-tight text-fg", desktop ? "text-[40px] leading-[48px]" : "text-[28px] leading-8")}>
          {en ? "Create your free account" : "Crea tu cuenta gratis"}
        </p>
        <p className={cn("mt-2 text-fg-body", desktop ? "max-w-lg text-[16px] leading-6" : "text-[15px] leading-5")}>
          {en
            ? `Practice with US$10,000 in play money or invest from US$${LANDING_MIN_ORDER_USD}.`
            : `Practica con US$10.000 ficticios o invierte desde US$${LANDING_MIN_ORDER_USD}.`}
        </p>
        <div className={desktop ? "mt-5 flex flex-wrap items-center gap-x-6 gap-y-1" : undefined}>
          <Link
            href="/app/registro"
            className={cn(
              "inline-flex min-h-12 items-center justify-center rounded-full bg-fg px-6 text-[16px] font-semibold text-bg outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
              desktop ? "px-8" : "mt-4 w-full",
            )}
          >
            {en ? "Create account" : "Crear cuenta"}
          </Link>
          <Link
            href="/app/ingresar"
            className={cn(
              "flex min-h-11 items-center justify-center text-[15px] font-medium text-fg underline underline-offset-4",
              desktop ? undefined : "mt-1",
            )}
          >
            {en ? "I already have an account" : "Ya tengo cuenta"}
          </Link>
        </div>
      </section>
    );
  }

  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const shownCurrency: Currency = currency === "CLP" && fxKnown ? "CLP" : "USD";
  const data = portfolio.data;
  const masked = hidden === true;
  const pnlPct = data?.pnlPct ?? null;
  const pnlUsd = data?.pnlUsd ?? null;
  const tone = pnlPct === null || pnlPct === 0 ? "flat" : pnlPct > 0 ? "up" : "down";

  return (
    <section aria-label={en ? "Your balance" : "Tu saldo"} className={cn(desktop ? "" : "px-0.5 pt-1", className)}>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] leading-4 font-medium text-fg-muted">
          {mode === "demo" ? "Demo" : "Real"}
        </span>
        {desktop ? <HideBalanceToggle className="-my-3 -ml-1" /> : null}
      </div>

      <div className={cn("flex items-center gap-3", desktop ? "justify-start" : "justify-between")} aria-live="polite">
        <span className="sr-only">{en ? "Balance" : "Saldo"}</span>
        {portfolio.isPending ? (
          <Skeleton className={cn("mt-1", desktop ? "h-12 w-64" : "h-10 w-48")} />
        ) : portfolio.isError || !data ? (
          <div className="flex items-center gap-3">
            <p className="text-[15px] text-fg-body">{en ? "Balance unavailable." : "No pudimos cargar tu saldo."}</p>
            <button type="button" onClick={() => void portfolio.refetch()} className="min-h-11 text-[14px] font-medium text-fg underline underline-offset-4">
              {t.states.retry}
            </button>
          </div>
        ) : (
          <p
            className={cn(
              "tabular-nums min-w-0 truncate font-semibold tracking-tight text-fg",
              desktop ? "text-[48px] leading-[56px]" : "text-[36px] leading-[44px]",
            )}
          >
            {masked ? MASK : shown(data.totalUsd, shownCurrency, fxKnown ? rate : undefined)}
          </p>
        )}
        {desktop ? null : <HideBalanceToggle className="-mr-2" />}
      </div>

      {data ? (
        pnlPct !== null ? (
          <p
            className={cn(
              "tabular-nums mt-0.5 text-[15px] leading-5 font-medium",
              tone === "up" && "text-up",
              tone === "down" && "text-down",
              tone === "flat" && "text-fg-muted",
            )}
          >
            <span aria-hidden>{tone === "up" ? "↑ " : tone === "down" ? "↓ " : ""}</span>
            {masked
              ? MASK
              : `${pnlUsd !== null ? `${pnlUsd >= 0 ? "+" : "−"}${shown(Math.abs(pnlUsd), shownCurrency, fxKnown ? rate : undefined)} · ` : ""}${formatPercent(pnlPct)}`}
            <span className="font-normal text-fg-muted">{en ? " total" : " en total"}</span>
          </p>
        ) : (
          <p className="mt-0.5 text-[15px] leading-5 text-fg-muted">{en ? "No positions yet" : "Aún sin posiciones"}</p>
        )
      ) : null}
    </section>
  );
}

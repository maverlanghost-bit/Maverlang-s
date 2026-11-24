"use client";

import { IconEye, IconEyeOff } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatMoney, formatPercent } from "@/lib/format";
import { useAccountMode } from "@/lib/hooks/use-account-mode";
import { useHideBalance } from "@/lib/hooks/use-hide-balance";
import { useFx, usePortfolio } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import type { Currency } from "@/lib/types";

/**
 * Encabezado de saldo del Mercado en celular: rótulo, monto grande y resultado
 * total de la cartera. Sin tarjeta. El ojo oculta los montos con la misma
 * preferencia por usuario que la barra lateral (`useHideBalance`).
 * No hay serie histórica del saldo en los hooks, así que no hay mini gráfico.
 * Sólo con sesión: sin usuario no hay saldo que mostrar.
 */

const MASK = "••••••";

function shown(usd: number, currency: Currency, rate: number | undefined): string {
  if (currency === "CLP" && rate !== undefined) return formatMoney(usd * rate, "CLP");
  return formatMoney(usd, "USD");
}

export function MobileBalanceCard({ className }: { className?: string }) {
  const { t, currency, language } = useT();
  const en = language === "en";
  const { hidden, toggle, userId } = useHideBalance();
  const { mode } = useAccountMode();
  const portfolio = usePortfolio();
  const fx = useFx();

  if (!userId) return null;

  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const shownCurrency: Currency = currency === "CLP" && fxKnown ? "CLP" : "USD";
  const data = portfolio.data;
  const masked = hidden === true;
  const pnlPct = data?.pnlPct ?? null;
  const pnlUsd = data?.pnlUsd ?? null;
  const tone = pnlPct === null || pnlPct === 0 ? "flat" : pnlPct > 0 ? "up" : "down";

  return (
    <section aria-label={en ? "Your balance" : "Tu saldo"} className={cn("px-0.5 pt-1", className)}>
      <div className="flex items-center gap-2">
        <p className="text-[15px] leading-5 text-fg-muted">{en ? "Balance" : "Saldo"}</p>
        {mode === "demo" ? (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] leading-4 font-medium text-fg-muted">Demo</span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3" aria-live="polite">
        {portfolio.isPending ? (
          <Skeleton className="mt-1 h-10 w-48" />
        ) : portfolio.isError || !data ? (
          <div className="flex items-center gap-3">
            <p className="text-[15px] text-fg-body">{en ? "Balance unavailable." : "No pudimos cargar tu saldo."}</p>
            <button type="button" onClick={() => void portfolio.refetch()} className="min-h-11 text-[14px] font-medium text-fg underline underline-offset-4">
              {t.states.retry}
            </button>
          </div>
        ) : (
          <p className="tabular-nums min-w-0 truncate text-[36px] leading-[44px] font-semibold tracking-tight text-fg">
            {masked ? MASK : shown(data.totalUsd, shownCurrency, fxKnown ? rate : undefined)}
          </p>
        )}
        <button
          type="button"
          onClick={toggle}
          disabled={hidden === null}
          aria-pressed={masked}
          aria-label={masked ? t.shell.showBalance : t.shell.hideBalance}
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-1 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:opacity-40"
        >
          {masked ? <IconEyeOff className="size-5" /> : <IconEye className="size-5" />}
        </button>
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

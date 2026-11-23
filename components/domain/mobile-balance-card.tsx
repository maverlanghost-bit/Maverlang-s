"use client";

import Link from "next/link";

import { IconEye, IconEyeOff } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatMoney, formatPercent } from "@/lib/format";
import { useHideBalance } from "@/lib/hooks/use-hide-balance";
import { useFx, usePortfolio } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import type { Currency } from "@/lib/types";

/**
 * Tarjeta de saldo del Mercado en celular (T94; T97: vidrio claro, sin rótulos),
 * con el total, la variación de la
 * cartera y dos accesos. El ojo oculta todos los montos con la misma
 * preferencia por usuario que la barra lateral (`useHideBalance`).
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
  const invested = data ? Math.max(0, data.totalUsd - data.cashUsdc) : null;
  const tone = pnlPct === null || pnlPct === 0 ? "flat" : pnlPct > 0 ? "up" : "down";

  return (
    <section
      aria-label={en ? "Your balance" : "Tu saldo"}
      className={cn(
        // Vidrio claro (T97): tinte blanco translúcido con desenfoque, realce interior
        // arriba (luz) y abajo (rebote) y una sombra muy suave de elevación.
        "relative isolate overflow-hidden rounded-[28px] border border-white/80 bg-white/60 px-5 py-4 text-fg backdrop-blur-xl backdrop-saturate-150",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.95),inset_0_-1px_0_rgb(255_255_255/0.5),0_10px_30px_-12px_rgb(16_24_40/0.18)]",
        className,
      )}
    >
      {/* Profundidad del vidrio: luz fría arriba a la izquierda y un rebote gris azulado abajo. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_0%_0%,rgb(255_255_255/0.95),transparent_60%),radial-gradient(90%_70%_at_100%_100%,rgb(196_206_222/0.45),transparent_70%)]" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-1/2 bg-gradient-to-b from-white/70 to-transparent" />

      <div className="flex items-center justify-between gap-3" aria-live="polite">
        {portfolio.isPending ? (
          <Skeleton className="h-10 w-44" />
        ) : portfolio.isError || !data ? (
          <div className="flex items-center gap-3">
            <p className="text-[15px] text-fg-body">{en ? "Balance unavailable." : "No pudimos cargar tu saldo."}</p>
            <button type="button" onClick={() => void portfolio.refetch()} className="min-h-11 text-[14px] font-medium text-fg underline underline-offset-4">
              {t.states.retry}
            </button>
          </div>
        ) : (
          <p className="num min-w-0 truncate text-[clamp(2rem,1.6rem+2vw,2.5rem)] leading-tight tracking-tight">
            {masked ? MASK : shown(data.totalUsd, shownCurrency, fxKnown ? rate : undefined)}
          </p>
        )}
        <button
          type="button"
          onClick={toggle}
          disabled={hidden === null}
          aria-pressed={masked}
          aria-label={masked ? t.shell.showBalance : t.shell.hideBalance}
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-white/70 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:opacity-40"
        >
          {masked ? <IconEyeOff className="size-[18px]" /> : <IconEye className="size-[18px]" />}
        </button>
      </div>

      {data ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {pnlPct !== null ? (
            <span
              className={cn(
                "num inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px]",
                tone === "up" && "bg-up-bg text-up",
                tone === "down" && "bg-down-bg text-down",
                tone === "flat" && "bg-white/70 text-fg-muted",
              )}
            >
              <span aria-hidden>{tone === "up" ? "↑" : tone === "down" ? "↓" : "→"}</span>
              {masked ? MASK : `${pnlUsd !== null ? `${pnlUsd >= 0 ? "+" : "−"}${shown(Math.abs(pnlUsd), shownCurrency, fxKnown ? rate : undefined)} · ` : ""}${formatPercent(pnlPct)}`}
              <span className="sr-only">{en ? " total return" : " de resultado total"}</span>
            </span>
          ) : (
            <span className="text-[13px] text-fg-muted">{en ? "No positions yet" : "Aún sin posiciones"}</span>
          )}
        </div>
      ) : null}

      {data ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-fg/[0.07] pt-3">
          <div className="min-w-0">
            <dt className="text-[12px] text-fg-muted">{en ? "Available" : "Disponible"}</dt>
            <dd className="num mt-0.5 truncate text-[15px]">{masked ? MASK : shown(data.cashUsdc, shownCurrency, fxKnown ? rate : undefined)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-fg-muted">{en ? "Invested" : "Invertido"}</dt>
            <dd className="num mt-0.5 truncate text-[15px]">{masked || invested === null ? MASK : shown(invested, shownCurrency, fxKnown ? rate : undefined)}</dd>
          </div>
        </dl>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href="/app/billetera/depositar"
          className="flex min-h-11 items-center justify-center rounded-full bg-fg text-[14px] font-medium text-bg transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
        >
          {en ? "Deposit" : "Depositar"}
        </Link>
        <Link
          href="/app/cartera"
          className="flex min-h-11 items-center justify-center rounded-full border border-white/90 bg-white/70 text-[14px] font-medium text-fg transition-colors hover:bg-white active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
        >
          {en ? "Portfolio" : "Ver cartera"}
        </Link>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";

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
 * Tarjeta de saldo del Mercado en celular (T94). Negra (la superficie
 * invertida es el foco de la pantalla), con el total, la variación de la
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
  const account = useAccountMode();
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
      className={cn("relative isolate overflow-hidden rounded-[28px] bg-fg p-5 text-white", className)}
    >
      {/* Brillo suave arriba a la derecha: da volumen a la tarjeta negra, sin color nuevo. */}
      <span aria-hidden className="pointer-events-none absolute -top-24 -right-16 -z-10 size-64 rounded-full bg-white/[0.07] blur-2xl" />

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-[13px] text-white/70">{en ? "Total balance" : "Saldo total"}</p>
          {account.mode === "demo" ? (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/80">
              {en ? "Demo" : "Demo"}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={hidden === null}
          aria-pressed={masked}
          aria-label={masked ? t.shell.showBalance : t.shell.hideBalance}
          className="-mr-2 grid size-11 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40"
        >
          {masked ? <IconEyeOff className="size-[18px]" /> : <IconEye className="size-[18px]" />}
        </button>
      </div>

      <div className="mt-1" aria-live="polite">
        {portfolio.isPending ? (
          <Skeleton className="h-10 w-44 bg-white/10" />
        ) : portfolio.isError || !data ? (
          <div className="flex items-center gap-3">
            <p className="text-[15px] text-white/80">{en ? "Balance unavailable." : "No pudimos cargar tu saldo."}</p>
            <button type="button" onClick={() => void portfolio.refetch()} className="min-h-11 text-[14px] font-medium text-white underline underline-offset-4">
              {t.states.retry}
            </button>
          </div>
        ) : (
          <p className="num text-[clamp(2rem,1.6rem+2vw,2.5rem)] leading-tight tracking-tight">
            {masked ? MASK : shown(data.totalUsd, shownCurrency, fxKnown ? rate : undefined)}
          </p>
        )}
      </div>

      {data ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {pnlPct !== null ? (
            <span
              className={cn(
                "num inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px]",
                tone === "up" && "bg-[#7ee2a8]/15 text-[#7ee2a8]",
                tone === "down" && "bg-[#ff9b9b]/15 text-[#ff9b9b]",
                tone === "flat" && "bg-white/10 text-white/80",
              )}
            >
              <span aria-hidden>{tone === "up" ? "↑" : tone === "down" ? "↓" : "→"}</span>
              {masked ? MASK : `${pnlUsd !== null ? `${pnlUsd >= 0 ? "+" : "−"}${shown(Math.abs(pnlUsd), shownCurrency, fxKnown ? rate : undefined)} · ` : ""}${formatPercent(pnlPct)}`}
              <span className="sr-only">{en ? " total return" : " de resultado total"}</span>
            </span>
          ) : (
            <span className="text-[13px] text-white/60">{en ? "No positions yet" : "Aún sin posiciones"}</span>
          )}
        </div>
      ) : null}

      {data ? (
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
          <div className="min-w-0">
            <dt className="text-[12px] text-white/60">{en ? "Available" : "Disponible"}</dt>
            <dd className="num mt-0.5 truncate text-[15px]">{masked ? MASK : shown(data.cashUsdc, shownCurrency, fxKnown ? rate : undefined)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-white/60">{en ? "Invested" : "Invertido"}</dt>
            <dd className="num mt-0.5 truncate text-[15px]">{masked || invested === null ? MASK : shown(invested, shownCurrency, fxKnown ? rate : undefined)}</dd>
          </div>
        </dl>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Link
          href="/app/billetera/depositar"
          className="flex min-h-11 items-center justify-center rounded-full bg-white text-[14px] font-medium text-fg transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {en ? "Deposit" : "Depositar"}
        </Link>
        <Link
          href="/app/cartera"
          className="flex min-h-11 items-center justify-center rounded-full bg-white/10 text-[14px] font-medium text-white transition-colors hover:bg-white/15 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {en ? "Portfolio" : "Ver cartera"}
        </Link>
      </div>
    </section>
  );
}

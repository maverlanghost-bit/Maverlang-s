"use client";

import { useMemo, useState } from "react";

import { site } from "@/config/site";
import { cn } from "@/lib/cn";

/** Montos de ejemplo en dólares (chips). */
const AMOUNTS_USD = [10, 100, 500, 2_000] as const;

/** Costo de red por transacción (estimado, en US$). */
const NETWORK_FEE_USD = 0.001;
/** Apertura de la cuenta del token: sólo la primera compra de ese activo (en US$). */
const TOKEN_ACCOUNT_USD = 0.3;

/** Separador de miles es-CL, sin decimales. */
function formatAmount(value: number): string {
  return `US$${value.toLocaleString("es-CL")}`;
}

function formatUsdFee(value: number, decimals: number): string {
  return `US$${value.toFixed(decimals).replace(".", ",")}`;
}

/** Porcentaje es-CL: dos decimales y coma («100,00»). */
const PERCENT_FORMAT = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Rótulo de dato a 13px: el mínimo de lectura del rediseño. */
const MICRO = "font-mono text-[13px] font-medium uppercase tracking-[0.045em] text-fg-muted";

/**
 * Simulador de costos de una compra: comisión de plataforma, red Solana y
 * apertura de la cuenta del token. Ilustrativo: no incluye spread ni la
 * comisión del proveedor de depósito.
 */
export function CostSimulator() {
  const [amountUsd, setAmountUsd] = useState<number>(100);
  const [firstTime, setFirstTime] = useState<boolean>(false);

  const costs = useMemo(() => {
    const tokenAccountUsd = firstTime ? TOKEN_ACCOUNT_USD : 0;
    const totalFeesUsd = NETWORK_FEE_USD + tokenAccountUsd;
    const capitalPct = ((amountUsd - totalFeesUsd) / amountUsd) * 100;
    return {
      tokenAccountUsd,
      capitalPct: PERCENT_FORMAT.format(capitalPct),
    };
  }, [amountUsd, firstTime]);

  return (
    <div>
      <div className="border-t border-border">
        <div className="border-b border-border py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-fg">Monto de la orden</p>
            <p className="num text-sm text-fg-muted">{formatAmount(amountUsd)}</p>
          </div>
          <div role="group" aria-label="Monto de la orden" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {AMOUNTS_USD.map((amount) => {
              const selected = amount === amountUsd;
              return (
                <button
                  key={amount}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setAmountUsd(amount)}
                  className={cn(
                    "num min-h-11 border px-2 text-[13px] font-medium tabular-nums transition-colors duration-150",
                    selected
                      ? "border-fg bg-fg text-white"
                      : "border-border bg-bg text-fg-body hover:border-fg",
                  )}
                >
                  {formatAmount(amount)}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex min-h-16 cursor-pointer items-start justify-between gap-6 border-b border-border py-5">
          <input
            type="checkbox"
            checked={firstTime}
            onChange={(event) => setFirstTime(event.target.checked)}
            className="peer sr-only"
          />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-fg">Primera compra de este activo</span>
            <span className="text-[13px] leading-relaxed text-fg-muted">
              Suma el costo de abrir la cuenta del token. Sólo ocurre una vez.
            </span>
          </span>
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center border border-control bg-bg transition-colors duration-150 peer-checked:border-fg peer-checked:bg-fg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fg"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className={cn(
                "size-3 text-white transition-opacity duration-150",
                firstTime ? "opacity-100" : "opacity-0",
              )}
            >
              <path
                d="m5 12.5 4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </label>
      </div>

      <div className="mt-8">
        <p className={MICRO}>Recibo estimado</p>
        <dl className="mt-4 border-t border-border">
          <div className="flex items-baseline justify-between gap-4 border-b border-border py-3">
            <dt className="text-sm text-fg-muted">Monto de la orden</dt>
            <dd className="num text-sm font-medium text-fg">{formatAmount(amountUsd)}</dd>
          </div>

          <div className="flex items-baseline justify-between gap-4 border-b border-border py-3">
            <dt className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-fg-muted">
              <span>Comisión {site.name}</span>
              <span className="text-[13px] text-fg-muted">(0% en lanzamiento)</span>
            </dt>
            <dd className="flex shrink-0 items-baseline gap-3">
              <span className="num text-sm font-medium text-fg">{formatUsdFee(0, 2)}</span>
              <span className="num text-[13px] text-fg-muted">0%</span>
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-4 border-b border-border py-3">
            <dt className="text-sm text-fg-muted">Costo estimado red Solana</dt>
            <dd className="num text-sm font-medium text-fg">{formatUsdFee(NETWORK_FEE_USD, 3)}</dd>
          </div>

          <div className="flex items-baseline justify-between gap-4 border-b border-border py-3">
            <dt className="flex min-w-0 flex-col gap-0.5 text-sm text-fg-muted">
              <span>Apertura de la cuenta del token</span>
              <span className="text-[13px] text-fg-muted">Sólo la primera vez</span>
            </dt>
            <dd className="num shrink-0 text-sm font-medium text-fg">
              {firstTime ? formatUsdFee(costs.tokenAccountUsd, 2) : "US$0,00 (ya abierta)"}
            </dd>
          </div>

          <div className="flex items-end justify-between gap-6 pt-5">
            <dt className="max-w-[24ch] text-sm leading-snug text-fg-muted">
              Capital efectivo estimado en el activo
            </dt>
            <dd aria-live="polite" className="num text-4xl leading-none tracking-tight text-fg sm:text-5xl">
              {costs.capitalPct}%
            </dd>
          </div>
        </dl>
      </div>

      <p className="mt-5 text-[13px] leading-relaxed text-pretty text-fg-muted">
        Simulación ilustrativa de costos de plataforma y red. La diferencia de precio (spread) y la
        comisión del proveedor de depósito dependen del mercado y medio elegido al operar.
      </p>
    </div>
  );
}

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
    <div className="flex flex-col gap-5">
      <div role="group" aria-label="Monto de la orden" className="flex flex-col gap-3">
        <p className="text-sm font-medium text-fg">Monto de la orden</p>
        <div className="flex flex-wrap gap-2">
          {AMOUNTS_USD.map((amount) => {
            const selected = amount === amountUsd;
            return (
              <button
                key={amount}
                type="button"
                aria-pressed={selected}
                onClick={() => setAmountUsd(amount)}
                className={cn(
                  "num min-h-11 rounded-full border px-4 text-sm font-medium transition-colors duration-150",
                  selected
                    ? "border-fg bg-surface-3 text-fg"
                    : "border-border-control bg-bg text-fg-muted hover:border-fg hover:text-fg",
                )}
              >
                {formatAmount(amount)}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        aria-pressed={firstTime}
        onClick={() => setFirstTime((previous) => !previous)}
        className={cn(
          "flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl border bg-bg px-4 py-3 text-left transition-colors duration-150",
          firstTime ? "border-fg" : "border-border-control hover:border-fg",
        )}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium text-fg">Primera compra de este activo</span>
          <span className="text-xs leading-relaxed text-fg-muted">
            Suma el costo de abrir la cuenta del token. Sólo ocurre una vez.
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150",
            firstTime ? "bg-fg" : "bg-surface-3",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-white transition-transform duration-150",
              firstTime ? "translate-x-[1.375rem]" : "translate-x-0.5",
            )}
          />
        </span>
      </button>

      <div className="rounded-3xl border border-border bg-bg p-6 shadow-sm">
        <p className="label">Recibo estimado</p>

        <dl className="mt-4 flex flex-col">
          <div className="flex items-baseline justify-between gap-4 border-b border-border py-3 first:pt-0">
            <dt className="text-sm text-fg-muted">Monto de la orden</dt>
            <dd className="num text-sm font-medium text-fg">{formatAmount(amountUsd)}</dd>
          </div>

          <div className="flex items-baseline justify-between gap-4 border-b border-border py-3">
            <dt className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-fg-muted">
              <span>Comisión {site.name}</span>
              <span className="text-xs text-fg-muted">(0% en lanzamiento)</span>
            </dt>
            <dd className="flex shrink-0 items-center gap-2">
              <span className="num text-sm font-medium text-fg">{formatUsdFee(0, 2)}</span>
              <span className="rounded-full bg-up-bg px-2 py-0.5 text-xs font-semibold text-up">0%</span>
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-4 border-b border-border py-3">
            <dt className="text-sm text-fg-muted">Costo estimado red Solana</dt>
            <dd className="num text-sm font-medium text-fg">{formatUsdFee(NETWORK_FEE_USD, 3)}</dd>
          </div>

          <div className="flex items-baseline justify-between gap-4 border-b border-border py-3">
            <dt className="flex min-w-0 flex-col gap-0.5 text-sm text-fg-muted">
              <span>Apertura de la cuenta del token</span>
              <span className="text-xs text-fg-muted">Sólo la primera vez</span>
            </dt>
            <dd className="num shrink-0 text-sm font-medium text-fg">
              {firstTime ? formatUsdFee(costs.tokenAccountUsd, 2) : "US$0,00 (ya abierta)"}
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-4 pt-4">
            <dt className="text-sm font-medium text-fg">Capital efectivo estimado en el activo</dt>
            <dd aria-live="polite" className="num text-lg font-semibold text-fg">
              {costs.capitalPct} %
            </dd>
          </div>
        </dl>
      </div>

      <p className="text-xs leading-relaxed text-pretty text-fg-muted">
        Simulación ilustrativa de costos de plataforma y red. La diferencia de precio (spread) y la
        comisión del proveedor de depósito dependen del mercado y medio elegido al operar.
      </p>
    </div>
  );
}

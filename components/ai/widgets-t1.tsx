"use client";

/**
 * Widgets de la tanda 1: empresa, cartera de hoy, simulación y confirmación de
 * alerta. Los arma el servidor con datos de los servicios; aquí sólo se
 * muestran. Ningún widget inventa cifras: si el dato falta, dice "sin dato".
 * La alerta NO se crea al pintar la tarjeta: sólo con el clic en "Crear alerta".
 */

import Link from "next/link";
import { useState } from "react";

import { detailHref, finiteOrNull } from "@/components/ai/model";
import { createPriceAlert, formatAlertMoney } from "@/components/domain/alert-client";
import { ChangeBadge } from "@/components/domain/change-badge";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { cn } from "@/lib/cn";
import { formatClp, formatDateTime, formatPortion, formatShares, formatUsd } from "@/lib/format";
import { ACTIVE_ALERT_CAP_MESSAGE } from "@/lib/services/alerts-logic";
import type { AiWidget } from "@/components/ai/contract";

/** Texto único para cualquier valor que el servidor no pudo completar. */
const SIN_DATO = "sin dato";

const CARD_CLASS =
  "min-w-0 rounded-2xl border border-border/85 bg-bg-elevated/95 p-4 shadow-[0_10px_30px_-14px_rgba(12,15,20,0.1)] backdrop-blur-md transition-all duration-200 hover:border-brand/35 hover:shadow-[0_14px_34px_-14px_rgba(12,15,20,0.14)]";

const ROW_CLASS = "flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0";

const oneDecimal = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
const threeDecimals = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });
const wholeNumber = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

function textOrSinDato(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return text || SIN_DATO;
}

function usdOrSinDato(value: number | null): string {
  const amount = finiteOrNull(value);
  return amount == null ? SIN_DATO : formatUsd(amount);
}

function clpOrSinDato(value: number | null): string {
  const amount = finiteOrNull(value);
  return amount == null ? SIN_DATO : formatClp(amount);
}

function numberOrSinDato(value: number | null, format: Intl.NumberFormat): string {
  const amount = finiteOrNull(value);
  return amount == null ? SIN_DATO : format.format(amount);
}

function unitsOrSinDato(value: number | null): string {
  const units = finiteOrNull(value);
  return units == null ? SIN_DATO : formatShares(units);
}

function monthsOrSinDato(value: number | null): string {
  const months = finiteOrNull(value);
  if (months == null) return SIN_DATO;
  return `${wholeNumber.format(months)} ${Math.abs(months) === 1 ? "mes" : "meses"}`;
}

/**
 * Los pesos y los porcentajes llegan como ratio (0,25) o como porcentaje (25).
 * Se normaliza a ratio 0..1 para dibujar la barra y para `formatPortion`.
 */
function ratioFromPortion(value: number): number {
  const ratio = Math.abs(value) <= 1 ? value : value / 100;
  return Math.min(1, Math.max(0, ratio));
}

function portionFromPercent(value: number | null): string {
  const pct = finiteOrNull(value);
  return pct == null ? SIN_DATO : formatPortion(ratioFromPortion(pct));
}

/** ISO con hora: la zona va explícita (`Z` o `±hh:mm`); sin ella no hay instante seguro. */
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;
const dayFormatter = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "UTC" });

/** Fecha de calendario sin correr el día por la zona horaria. */
function dayLabel(text: string): string | null {
  const parts = text.split("-").map(Number);
  const [year, month, date] = parts;
  if (parts.length !== 3 || !year || !month || !date) return null;
  return dayFormatter.format(new Date(Date.UTC(year, month - 1, date)));
}

/** `asOf` puede ser fecha suelta o ISO con hora; si no se entiende, se muestra tal cual. */
function asOfLabel(value: string | null): string {
  const text = (value ?? "").trim();
  if (!text) return SIN_DATO;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return dayLabel(text) ?? text;
  if (HAS_ZONE.test(text) && !Number.isNaN(Date.parse(text))) return formatDateTime(text);
  const day = text.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return dayLabel(day) ?? text;
  return text;
}

function logoFor(ticker: string): string | null {
  return logoPathFromSymbol(ticker);
}

export function CompanyWidget({ widget }: { widget: Extract<AiWidget, { type: "company" }> }) {
  const href = detailHref(widget.ticker);
  const facts = widget.facts ?? [];

  return (
    <article data-ai-widget="company" className={CARD_CLASS}>
      <div className="flex items-center gap-3">
        <TickerLogo
          symbol={widget.ticker}
          name={widget.name}
          logoUrl={logoFor(widget.ticker)}
          size={40}
          loading="lazy"
          sizes="40px"
        />
        <div className="min-w-0 flex-1">
          {href ? (
            <Link
              href={href}
              className="block truncate rounded-sm font-semibold text-fg outline-none transition-colors hover:text-brand focus-visible:ring-4 focus-visible:ring-fg/20"
            >
              {widget.name}
            </Link>
          ) : (
            <p className="truncate font-semibold text-fg">{widget.name}</p>
          )}
          <p className="truncate text-sm text-fg-muted">{widget.ticker}</p>
        </div>
      </div>
      <h2 className="label mt-3">Datos de la empresa</h2>
      {facts.length === 0 ? (
        <p className="mt-1 text-sm text-fg-muted">{SIN_DATO}</p>
      ) : (
        <dl className="mt-1 border-t border-border/70">
          {facts.map((fact, index) => (
            <div key={`${fact.label}-${index}`} className={ROW_CLASS}>
              <dt className="min-w-0 text-sm text-fg-muted">{textOrSinDato(fact.label)}</dt>
              <dd
                className={cn(
                  "num max-w-[60%] text-right text-sm break-words tabular-nums",
                  fact.value == null ? "text-fg-muted" : "font-medium text-fg",
                )}
              >
                {textOrSinDato(fact.value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 text-xs leading-relaxed text-fg-muted">
        Fuente: <span className="text-fg-body">{textOrSinDato(widget.source)}</span> · Datos al{" "}
        <span className="text-fg-body">{asOfLabel(widget.asOf)}</span>
      </p>
    </article>
  );
}

export function PortfolioTodayWidget({ widget }: { widget: Extract<AiWidget, { type: "portfolio-today" }> }) {
  const positions = widget.positions ?? [];

  return (
    <article data-ai-widget="portfolio-today" className={CARD_CLASS}>
      <h2 className="label">Tu cartera hoy</h2>
      <p className="num mt-1 text-2xl font-semibold tracking-tight tabular-nums text-fg">{usdOrSinDato(widget.totalUsd)}</p>
      <p className="mt-1 text-sm text-fg-muted">
        Efectivo en USDC: <span className="num font-medium tabular-nums text-fg-body">{usdOrSinDato(widget.cashUsdc)}</span>
      </p>
      {positions.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">Sin posiciones</p>
      ) : (
        <ul className="mt-3 border-t border-border/70">
          {positions.map((position, index) => {
            const change = finiteOrNull(position.changePct);
            const weight = finiteOrNull(position.weightPct);
            const ratio = weight == null ? null : ratioFromPortion(weight);
            return (
              <li key={`${position.ticker}-${index}`} className="border-b border-border/70 py-2 last:border-b-0">
                <div className="flex min-h-11 items-center gap-2">
                  <TickerLogo
                    symbol={position.ticker}
                    name={position.name}
                    logoUrl={logoFor(position.ticker)}
                    size={32}
                    loading="lazy"
                    sizes="32px"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-fg">{textOrSinDato(position.name)}</span>
                    <span className="block truncate text-sm text-fg-muted">{position.ticker}</span>
                  </span>
                  <span className="num shrink-0 text-right text-sm font-medium tabular-nums text-fg">
                    {usdOrSinDato(position.valueUsd)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-xs tabular-nums text-fg-muted">
                    Peso <span className="num text-fg-body">{weight == null ? SIN_DATO : formatPortion(ratio ?? 0)}</span>
                  </span>
                  {change == null ? (
                    <span className="text-xs tabular-nums text-fg-muted">{SIN_DATO}</span>
                  ) : (
                    <ChangeBadge value={change} className="tabular-nums" />
                  )}
                </div>
                <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-brand transition-[width] duration-300"
                    style={{ width: `${((ratio ?? 0) * 100).toFixed(1)}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/70 pt-3">
        <div>
          <dt className="text-xs text-fg-muted">Concentración (HHI)</dt>
          <dd className="num text-sm font-medium tabular-nums text-fg">{numberOrSinDato(widget.hhi, threeDecimals)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">Posiciones efectivas</dt>
          <dd className="num text-sm font-medium tabular-nums text-fg">
            {numberOrSinDato(widget.effectivePositions, oneDecimal)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">Mayor posición</dt>
          <dd className="num text-sm font-medium tabular-nums text-fg">{portionFromPercent(widget.top1Pct)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">Tres mayores</dt>
          <dd className="num text-sm font-medium tabular-nums text-fg">{portionFromPercent(widget.top3Pct)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-fg-muted">Calculado con los pesos de tus posiciones de hoy.</p>
    </article>
  );
}

export function SimulationWidget({ widget }: { widget: Extract<AiWidget, { type: "simulation" }> }) {
  const rows: { label: string; value: string }[] = [
    { label: "Precio actual", value: usdOrSinDato(widget.priceUsd) },
    { label: "Monto", value: usdOrSinDato(widget.amountUsd) },
    { label: "Unidades al precio actual", value: unitsOrSinDato(widget.units) },
    { label: "Aporte mensual", value: clpOrSinDato(widget.monthlyClp) },
    { label: "Tipo de cambio USD/CLP", value: numberOrSinDato(widget.usdClp, twoDecimals) },
    { label: "Aporte mensual en US$", value: usdOrSinDato(widget.monthlyUsd) },
    { label: "Meses", value: monthsOrSinDato(widget.months) },
    { label: "Total aportado", value: usdOrSinDato(widget.totalUsd) },
  ];

  return (
    <article data-ai-widget="simulation" className={CARD_CLASS}>
      <h2 className="label">Simulación de compra</h2>
      <div className="mt-2 flex items-center gap-3">
        <TickerLogo
          symbol={widget.ticker}
          name={widget.name}
          logoUrl={logoFor(widget.ticker)}
          size={32}
          loading="lazy"
          sizes="32px"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-fg">{textOrSinDato(widget.name)}</p>
          <p className="truncate text-sm text-fg-muted">{widget.ticker}</p>
        </div>
      </div>
      <dl className="mt-3 border-t border-border/70">
        {rows.map((row) => (
          <div key={row.label} className={ROW_CLASS}>
            <dt className="min-w-0 text-sm text-fg-muted">{row.label}</dt>
            <dd className="num shrink-0 text-right text-sm font-medium tabular-nums text-fg">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-fg-muted">Las unidades se calculan con el precio actual.</p>
      <p className="mt-2 rounded-xl border border-border/70 bg-surface-1 px-3 py-2 text-xs leading-relaxed text-fg-body">
        Esto no es una proyección ni una recomendación.
      </p>
    </article>
  );
}

type AlertStatus = "idle" | "creating" | "created" | "error";

function alertErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "UNAUTHORIZED") return "Inicia sesión para crear la alerta.";
    if (error.code === "FORBIDDEN_REGION") return "No disponible desde tu ubicación.";
    if (error.code === "RATE_LIMITED") return "Demasiados intentos. Espera un momento y vuelve a probar.";
    if (error.code === "VALIDATION") {
      // El tope de avisos activos ya trae su propio texto, igual que en la ficha.
      if (error.message === ACTIVE_ALERT_CAP_MESSAGE) return ACTIVE_ALERT_CAP_MESSAGE;
      return "El servidor no aceptó esos datos. Revisa el símbolo y el precio.";
    }
    if (error.code === "NOT_FOUND") return "Ese símbolo no está en el catálogo.";
  }
  return "No pudimos crear la alerta. Inténtalo de nuevo.";
}

export function AlertConfirmWidget({ widget }: { widget: Extract<AiWidget, { type: "alert-confirm" }> }) {
  const [status, setStatus] = useState<AlertStatus>("idle");
  const [error, setError] = useState("");
  const threshold = finiteOrNull(widget.thresholdUsd);
  const href = detailHref(widget.ticker);
  const condition = widget.direction === "above" ? "sube por sobre" : "baja por debajo de";

  async function create() {
    if (threshold == null || status === "creating" || status === "created") return;
    setStatus("creating");
    setError("");
    try {
      await createPriceAlert({ symbol: widget.ticker, direction: widget.direction, priceUsd: threshold });
      setStatus("created");
    } catch (caught) {
      setError(alertErrorText(caught));
      setStatus("error");
    }
  }

  return (
    <article data-ai-widget="alert-confirm" className={CARD_CLASS}>
      <h2 className="label">Alerta de precio</h2>
      <div className="mt-2 flex items-center gap-3">
        <TickerLogo
          symbol={widget.ticker}
          name={widget.name}
          logoUrl={logoFor(widget.ticker)}
          size={40}
          loading="lazy"
          sizes="40px"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-fg">{textOrSinDato(widget.name)}</p>
          <p className="truncate text-sm text-fg-muted">{widget.ticker}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-fg-body">
        Avísame si {textOrSinDato(widget.name)} {condition}{" "}
        <span className="num font-medium text-fg">{threshold == null ? SIN_DATO : formatAlertMoney(threshold)}</span>.
      </p>
      <p className="mt-1 text-sm text-fg-muted">
        Precio actual: <span className="num tabular-nums">{usdOrSinDato(widget.priceUsd)}</span>
      </p>
      <Button
        type="button"
        className="mt-3 min-h-11 w-full"
        loading={status === "creating"}
        disabled={threshold == null || status === "created"}
        onClick={() => void create()}
      >
        {status === "creating" ? "Creando alerta…" : "Crear alerta"}
      </Button>
      <p role="status" aria-live="polite" className="mt-2 text-sm leading-relaxed text-fg-body">
        {status === "created" ? (
          <>
            Alerta creada. El chequeo es una vez al día.{" "}
            {href ? (
              <Link
                href={href}
                className="rounded-sm font-medium text-fg underline underline-offset-2 outline-none focus-visible:ring-4 focus-visible:ring-fg/20"
              >
                Ver en la ficha
              </Link>
            ) : null}
          </>
        ) : null}
      </p>
      {status === "error" ? (
        <p role="alert" className="mt-2 text-sm leading-relaxed text-down">
          {error}
        </p>
      ) : null}
    </article>
  );
}

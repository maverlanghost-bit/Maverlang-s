"use client";

import { useId, type ChangeEvent, type ReactNode } from "react";

import { indexFromKey } from "@/components/ui/keys";
import { cn } from "@/lib/cn";
import type { MoneyCurrency } from "@/lib/format";

/** CLP y USD son dinero. USDC se muestra como dólar. SHARES es la cantidad de la acción. */
export type AmountCurrency = MoneyCurrency | "USDC" | "SHARES";

const quickAmounts: Record<AmountCurrency, { label: string; value: number | "max" }[]> = {
  CLP: [
    { label: "$5.000", value: 5000 },
    { label: "$10.000", value: 10000 },
    { label: "$50.000", value: 50000 },
    { label: "Máx", value: "max" },
  ],
  USD: [
    { label: "US$ 10", value: 10 },
    { label: "US$ 50", value: 50 },
    { label: "US$ 100", value: 100 },
    { label: "Máx", value: "max" },
  ],
  USDC: [
    { label: "US$ 10", value: 10 },
    { label: "US$ 50", value: 50 },
    { label: "US$ 100", value: 100 },
    { label: "Máx", value: "max" },
  ],
  SHARES: [
    { label: "0,1", value: 0.1 },
    { label: "0,5", value: 0.5 },
    { label: "1", value: 1 },
    { label: "Máx", value: "max" },
  ],
};

const defaultLabels: Record<AmountCurrency, string> = {
  CLP: "CLP",
  USD: "USD",
  USDC: "USDC",
  SHARES: "Acciones",
};

function placesOf(currency: AmountCurrency) {
  if (currency === "CLP") return 0;
  if (currency === "SHARES") return 6;
  return 2;
}

function groupClp(digits: string) {
  if (!digits) return "";
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(Number(digits));
}

function decimalToDisplay(raw: string) {
  return raw.replace(".", ",");
}

function displayToDecimal(display: string, places: number) {
  const cleaned = display.replace(/[^\d,]/g, "");
  const [wholeRaw = "", fractionRaw] = cleaned.split(",");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "");
  if (fractionRaw === undefined) return whole;
  return `${whole || "0"}.${fractionRaw.slice(0, places)}`;
}

function asRaw(amount: number, currency: AmountCurrency) {
  const places = placesOf(currency);
  if (places === 0) return String(Math.max(0, Math.round(amount)));
  const factor = 10 ** places;
  const rounded = Math.round(Math.max(0, amount) * factor) / factor;
  return String(rounded);
}

export function AmountInput({
  label = "Monto",
  value,
  onChange,
  currency,
  onCurrencyChange,
  currencies,
  currencyLabel = "Moneda",
  labels,
  maxLabel,
  suffix,
  max,
  id,
  describedBy,
  invalid = false,
  chips,
  caption,
  inputClassName,
  chipClassName,
  chipsClassName,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  currency: AmountCurrency;
  onCurrencyChange?: (currency: AmountCurrency) => void;
  /** Si no se pasa, el conmutador es CLP ⇄ USD. */
  currencies?: readonly AmountCurrency[];
  currencyLabel?: string;
  labels?: Partial<Record<AmountCurrency, string>>;
  maxLabel?: string;
  suffix?: string;
  max?: number;
  id?: string;
  describedBy?: string;
  invalid?: boolean;
  /** Si no se pasa, los atajos son los de la moneda. */
  chips?: readonly { label: string; value: number | "max" }[];
  /** Línea bajo la cifra (equivalencia, nota del paso). Reserva alto fijo. */
  caption?: ReactNode;
  /** Ajustes sólo visuales (móvil) del campo y los atajos, sin tocar lógica. */
  inputClassName?: string;
  chipClassName?: string;
  chipsClassName?: string;
}) {
  const baseId = useId();
  const fieldId = id ?? `${baseId}-amount`;
  const places = placesOf(currency);
  const display = places === 0 ? groupClp(value.replace(/\D/g, "")) : decimalToDisplay(value);
  const choices = currencies ?? (["CLP", "USD"] as const);
  const shownChips = (chips ?? quickAmounts[currency]).map((chip) =>
    chip.value === "max" && maxLabel ? { ...chip, label: maxLabel } : chip,
  );
  // La unidad va pegada a la cifra: «12.345 CLP» no deja dudas de moneda.
  const unit =
    currency === "SHARES"
      ? (suffix ?? labels?.SHARES ?? defaultLabels.SHARES)
      : (labels?.[currency] ?? defaultLabels[currency]);
  // La cifra protagonista baja de tamaño sólo cuando el número es largo: nunca desborda a 360 px.
  const sizeClass =
    display.length > 11
      ? "text-[1.75rem] sm:text-[2rem]"
      : display.length > 8
        ? "text-[2rem] sm:text-[2.25rem]"
        : "text-[2.5rem] sm:text-[2.75rem]";

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    if (places === 0) {
      onChange(event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""));
      return;
    }
    onChange(displayToDecimal(event.target.value, places));
  }

  function applyQuick(amount: number | "max") {
    if (amount === "max") {
      if (max === undefined) return;
      onChange(asRaw(max, currency));
      return;
    }
    // Atajos acumulativos (N17): cada clic suma al monto actual (3× US$10 = US$30).
    const current = Number(value);
    const base = Number.isFinite(current) && current > 0 ? current : 0;
    const capped = max === undefined ? base + amount : Math.min(base + amount, max);
    onChange(asRaw(capped, currency));
  }

  return (
    <div className="flex w-full min-w-0 flex-col">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label htmlFor={fieldId} className="label cursor-default">
          {label}
        </label>
        {onCurrencyChange ? (
          <CurrencySwitch
            label={currencyLabel}
            value={currency}
            options={choices}
            labels={labels}
            onChange={(next) => {
              if (next !== currency) onCurrencyChange(next);
            }}
          />
        ) : null}
      </div>

      <div
        className={cn(
          /* El subrayado ES el borde del control: `border-control` da 3,74:1
             (con /45 se quedaba en 1,8:1, casi blanco). El foco suma 1 px
             interior sobre el borde: 2 px de tinta legibles a 390 px. */
          "mt-2 flex min-w-0 items-baseline gap-2 border-b pb-2.5 transition duration-150",
          invalid
            ? "border-down"
            : "border-border-control hover:border-fg focus-within:border-fg focus-within:shadow-[inset_0_-1px_0_#0a0a0a]",
        )}
      >
        <input
          id={fieldId}
          data-bare-input
          inputMode={places === 0 ? "numeric" : "decimal"}
          enterKeyHint="done"
          autoComplete="off"
          spellCheck={false}
          aria-label={`${label} en ${unit}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          placeholder="0"
          value={display}
          onChange={onInput}
          style={{ width: `${Math.max(display.length, 1) + 1}ch` }}
          className={cn(
            "min-w-0 max-w-full rounded-none bg-transparent text-left font-mono leading-none tracking-[-0.02em] text-fg tabular-nums caret-fg outline-none placeholder:text-fg-subtle",
            sizeClass,
            inputClassName,
          )}
        />
        <span className="shrink-0 font-mono text-[12px] leading-none font-medium tracking-[0.045em] text-fg-muted uppercase">
          {unit}
        </span>
      </div>

      {caption !== undefined ? (
        <div className="mt-2.5 min-h-5 text-[13px] leading-5 text-fg-muted">{caption}</div>
      ) : null}

      <div className={cn("mt-2 flex flex-wrap items-center gap-x-1", chipsClassName)}>
        {shownChips.map((chip) => {
          const target = chip.value === "max" ? (max === undefined ? null : asRaw(max, currency)) : asRaw(chip.value, currency);
          const pressed = target !== null && value === target;
          return (
            <button
              key={chip.label}
              type="button"
              aria-pressed={pressed}
              disabled={chip.value === "max" && max === undefined}
              onClick={() => applyQuick(chip.value)}
              className={cn(
                "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-[12px] leading-none font-medium tracking-[0.01em] tabular-nums transition-colors duration-150 hover:bg-surface-1 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 sm:min-h-9",
                pressed
                  ? "text-fg underline decoration-fg decoration-1 underline-offset-4"
                  : "text-fg-muted hover:text-fg",
                chipClassName,
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Conmutador de moneda: pista hairline + píldora blanca. Alto táctil de 44 px. */
function CurrencySwitch({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: AmountCurrency;
  options: readonly AmountCurrency[];
  labels?: Partial<Record<AmountCurrency, string>>;
  onChange: (currency: AmountCurrency) => void;
}) {
  const baseId = useId();

  function move(key: string) {
    const current = Math.max(0, options.indexOf(value));
    const next = indexFromKey(key, current, options.length);
    if (next === null) return;
    const option = options[next];
    if (!option) return;
    onChange(option);
    document.getElementById(`${baseId}-${option}`)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={(event) => {
        if (indexFromKey(event.key, 0, options.length) === null) return;
        event.preventDefault();
        move(event.key);
      }}
      className="inline-flex shrink-0 items-center rounded-full border border-border-control bg-bg p-0.5"
    >
      {options.map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            id={`${baseId}-${option}`}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option)}
            className={cn(
              "min-h-11 rounded-full px-3 text-xs font-medium tracking-[0.01em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-inset sm:min-h-9",
              /* Seleccionado sin depender del color: el anillo de 1 px aparece
                 sólo en la opción activa (la píldora gris sola daba 1,1:1). */
              selected
                ? "bg-surface-2 text-fg shadow-[inset_0_0_0_1px_#0a0a0a]"
                : "text-fg-muted hover:bg-surface-1 hover:text-fg",
            )}
          >
            {labels?.[option] ?? defaultLabels[option]}
          </button>
        );
      })}
    </div>
  );
}

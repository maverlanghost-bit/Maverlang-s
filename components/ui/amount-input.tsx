"use client";

import type { ChangeEvent } from "react";
import { cn } from "@/lib/cn";
import type { MoneyCurrency } from "@/lib/format";
import { SegmentedControl } from "@/components/ui/segmented-control";

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
    { label: "0,01", value: 0.01 },
    { label: "0,1", value: 0.1 },
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
}) {
  const places = placesOf(currency);
  const display = places === 0 ? groupClp(value.replace(/\D/g, "")) : decimalToDisplay(value);
  const symbol = currency === "CLP" ? "$" : currency === "SHARES" ? "" : "US$";
  const choices = currencies ?? (["CLP", "USD"] as const);
  const shownChips = (chips ?? quickAmounts[currency]).map((chip) =>
    chip.value === "max" && maxLabel ? { ...chip, label: maxLabel } : chip,
  );

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
    onChange(asRaw(amount, currency));
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <span className="text-sm font-medium text-fg">{label}</span>
      {onCurrencyChange ? (
        <SegmentedControl
          label={currencyLabel}
          value={currency}
          onChange={(next) => {
            const match = choices.find((choice) => choice === next);
            if (match) onCurrencyChange(match);
          }}
          options={choices.map((choice) => ({ value: choice, label: labels?.[choice] ?? defaultLabels[choice] }))}
        />
      ) : (
        <span className="text-sm text-fg-muted">{labels?.[currency] ?? defaultLabels[currency]}</span>
      )}
      <div className="flex max-w-full items-baseline justify-center gap-2">
        {symbol ? <span className="font-mono text-2xl text-fg-muted tabular-nums">{symbol}</span> : null}
        <input
          id={id}
          inputMode={places === 0 ? "numeric" : "decimal"}
          autoComplete="off"
          spellCheck={false}
          aria-label={`${label} en ${labels?.[currency] ?? defaultLabels[currency]}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          placeholder="0"
          value={display}
          onChange={onInput}
          style={{ width: `${Math.max(display.length, 1) + 1}ch` }}
          className="max-w-full overflow-x-auto bg-transparent text-center font-mono text-4xl text-fg tabular-nums outline-none placeholder:text-fg-subtle sm:text-5xl"
        />
        {suffix ? <span className="text-sm text-fg-muted">{suffix}</span> : null}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
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
                "min-h-11 rounded-full px-3 text-sm transition duration-[140ms] disabled:opacity-40",
                pressed ? "bg-surface-3 text-fg" : "bg-surface-2 text-fg hover:bg-surface-3",
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

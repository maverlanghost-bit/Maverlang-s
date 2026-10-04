"use client";

import type { ChangeEvent } from "react";
import { cn } from "@/lib/cn";
import type { MoneyCurrency } from "@/lib/format";
import { SegmentedControl } from "@/components/ui/segmented-control";

const quickAmounts: Record<MoneyCurrency, { label: string; value: number | "max" }[]> = {
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
};

function groupClp(digits: string) {
  if (!digits) return "";
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(Number(digits));
}

function usdToDisplay(raw: string) {
  return raw.replace(".", ",");
}

function displayToUsd(display: string) {
  const cleaned = display.replace(/[^\d,]/g, "");
  const [wholeRaw = "", fractionRaw] = cleaned.split(",");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "");
  if (fractionRaw === undefined) return whole;
  return `${whole || "0"}.${fractionRaw.slice(0, 2)}`;
}

function asRaw(amount: number, currency: MoneyCurrency) {
  if (currency === "CLP") return String(Math.round(amount));
  const rounded = Math.round(amount * 100) / 100;
  return String(rounded);
}

export function AmountInput({
  label = "Monto",
  value,
  onChange,
  currency,
  onCurrencyChange,
  max,
  id,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  currency: MoneyCurrency;
  onCurrencyChange?: (currency: MoneyCurrency) => void;
  max?: number;
  id?: string;
}) {
  const display = currency === "CLP" ? groupClp(value.replace(/\D/g, "")) : usdToDisplay(value);
  const symbol = currency === "CLP" ? "$" : "US$";

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    if (currency === "CLP") {
      onChange(event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""));
      return;
    }
    onChange(displayToUsd(event.target.value));
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
          label="Moneda"
          value={currency}
          onChange={(next) => onCurrencyChange(next === "USD" ? "USD" : "CLP")}
          options={[
            { value: "CLP", label: "CLP" },
            { value: "USD", label: "USD" },
          ]}
        />
      ) : (
        <span className="text-sm text-fg-muted">{currency}</span>
      )}
      <div className="flex max-w-full items-baseline justify-center gap-2">
        <span className="font-mono text-2xl text-fg-muted tabular-nums">{symbol}</span>
        <input
          id={id}
          inputMode={currency === "CLP" ? "numeric" : "decimal"}
          autoComplete="off"
          spellCheck={false}
          aria-label={`${label} en ${currency}`}
          placeholder="0"
          value={display}
          onChange={onInput}
          style={{ width: `${Math.max(display.length, 1) + 1}ch` }}
          className="max-w-full overflow-x-auto bg-transparent text-center font-mono text-4xl text-fg tabular-nums outline-none placeholder:text-fg-subtle sm:text-5xl"
        />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {quickAmounts[currency].map((chip) => {
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

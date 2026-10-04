"use client";

import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/cn";
import { moneyFormat, type MoneyCurrency } from "@/lib/format";

const sizeClass = {
  sm: "text-sm",
  md: "text-xl sm:text-2xl",
  lg: "text-4xl tracking-tight sm:text-5xl",
} as const;

export function PriceText({
  value,
  currency = "USD",
  size = "md",
  colorBySign = false,
  live = false,
  className,
}: {
  value: number;
  currency?: MoneyCurrency;
  size?: keyof typeof sizeClass;
  colorBySign?: boolean;
  live?: boolean;
  className?: string;
}) {
  const tone = !colorBySign || value === 0 ? "text-fg" : value > 0 ? "text-up" : "text-down";

  return (
    <NumberFlow
      value={value}
      locales="es-CL"
      format={{
        ...moneyFormat(currency),
        ...(colorBySign ? { signDisplay: "exceptZero" as const } : {}),
      }}
      respectMotionPreference
      aria-live={live ? "polite" : undefined}
      className={cn("num", sizeClass[size], tone, className)}
    />
  );
}

"use client";

import { cn } from "@/lib/cn";
import { usePriceFlash } from "@/lib/hooks/use-price-flash";
import { PriceText } from "@/components/domain/price-text";
import type { MoneyCurrency } from "@/lib/format";

/**
 * Precio con destello breve al cambiar (M41): fondo sutil `up-bg`/`down-bg`
 * ~700 ms. Sin animación con `prefers-reduced-motion` (el CSS global acorta
 * la transición): queda sólo el cambio breve.
 */
export function FlashPrice({
  value,
  currency = "USD",
  size = "md",
  colorBySign = false,
  live = false,
  className,
}: {
  value: number;
  currency?: MoneyCurrency;
  size?: "sm" | "md" | "lg";
  colorBySign?: boolean;
  live?: boolean;
  className?: string;
}) {
  const flash = usePriceFlash(value, currency);
  return (
    <span
      className={cn(
        "rounded-md px-1 transition-colors duration-300",
        flash === "up" ? "bg-up-bg" : flash === "down" ? "bg-down-bg" : "bg-transparent",
      )}
    >
      <PriceText value={value} currency={currency} size={size} colorBySign={colorBySign} live={live} className={className} />
    </span>
  );
}

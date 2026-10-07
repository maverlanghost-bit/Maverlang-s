"use client";

import { cn } from "@/lib/cn";
import { usePriceFlash, type PriceFlash } from "@/lib/hooks/use-price-flash";
import { PriceText } from "@/components/domain/price-text";
import type { MoneyCurrency } from "@/lib/format";

/**
 * Precio con destello breve al cambiar (M41): fondo sutil `up-bg`/`down-bg`
 * ~700 ms. Sin animación con `prefers-reduced-motion` (el CSS global acorta
 * la transición): queda sólo el cambio breve.
 * `force` (N18) fija el tono: al recorrer el gráfico el precio se tiñe sólo
 * contra el precio actual, sin destellar por cada punto intermedio.
 */
export function FlashPrice({
  value,
  currency = "USD",
  size = "md",
  colorBySign = false,
  live = false,
  force,
  className,
}: {
  value: number;
  currency?: MoneyCurrency;
  size?: "sm" | "md" | "lg";
  colorBySign?: boolean;
  live?: boolean;
  force?: PriceFlash;
  className?: string;
}) {
  const paused = force !== undefined;
  const flash = usePriceFlash(value, currency, paused);
  const tone = paused ? force : flash;
  return (
    <span
      className={cn(
        "rounded-md px-1 transition-colors duration-300",
        tone === "up" ? "bg-up-bg" : tone === "down" ? "bg-down-bg" : "bg-transparent",
      )}
    >
      <PriceText value={value} currency={currency} size={size} colorBySign={colorBySign} live={live} className={className} />
    </span>
  );
}

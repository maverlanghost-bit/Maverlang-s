"use client";

import { cn } from "@/lib/cn";
import { formatMoney, type MoneyCurrency } from "@/lib/format";

const sizeClass = {
  sm: "text-sm",
  md: "text-xl sm:text-2xl",
  lg: "text-4xl tracking-tight sm:text-5xl",
} as const;

/**
 * Precio formateado (US$/CLP). Texto plano con `Intl` es-CL.
 *
 * Antes usaba `@number-flow/react` para animar los dígitos, pero su wrapper
 * de React 0.6.2 no setea el valor en el custom element con React 19.2: el
 * `<number-flow-react>` queda VACÍO en producción y el precio no se ve en el
 * mercado, la cartera ni la billetera (verificado con el build de producción:
 * el custom element se define pero React nunca le pasa el valor). Un precio
 * invisible es peor que uno sin animación, así que se renderiza texto plano
 * (mismo formato que la portada, que ya funcionaba). Si NumberFlow arregla la
 * compatibilidad con React 19, se puede volver a activar la animación acá.
 */

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
  const sign = colorBySign && value > 0 ? "+" : "";
  return (
    <span
      className={cn("num", sizeClass[size], tone, className)}
      aria-live={live ? "polite" : undefined}
    >
      {`${sign}${formatMoney(value, currency)}`}
    </span>
  );
}

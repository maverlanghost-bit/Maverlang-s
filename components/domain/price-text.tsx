"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatMoney, type MoneyCurrency } from "@/lib/format";

const sizeClass = {
  sm: "text-sm",
  md: "text-xl sm:text-2xl",
  lg: "text-4xl tracking-tight sm:text-5xl",
} as const;

/**
 * Intervalo mínimo (ms) entre anuncios del lector de pantalla para un precio
 * en vivo (M85). Los ticks llegan cada 5 s (SPOT_MS) y cada 15 s (PRICE_MS);
 * anunciar cada uno satura al usuario. Con este throttle, el lector lee el
 * precio a lo sumo una vez cada 10 s y el resto de las actualizaciones del
 * texto quedan silenciosas.
 */
export const PRICE_ANNOUNCE_MS = 10_000;

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
 *
 * M85 (accesibilidad): con `live`, el precio visible sigue siendo texto
 * accesible normal y el anuncio vive en una región `aria-live="polite"`
 * visualmente oculta, actualizada con throttle (`PRICE_ANNOUNCE_MS`). La
 * región parte vacía y anuncia sólo cambios reales del precio, a lo sumo
 * una vez cada 10 s (los ticks de 5/15 s no saturan al lector de pantalla).
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
  // La región viva parte vacía: el lector ya lee el precio visible al cargar,
  // así que no se anuncia nada en el primer render.
  const [announced, setAnnounced] = useState("");
  const lastAnnounceRef = useRef<number | null>(null);

  const tone = !colorBySign || value === 0 ? "text-fg" : value > 0 ? "text-up" : "text-down";
  const sign = colorBySign && value > 0 ? "+" : "";
  const text = `${sign}${formatMoney(value, currency)}`;

  useEffect(() => {
    if (!live) return;
    // El reloj parte al montar: durante los primeros PRICE_ANNOUNCE_MS no se
    // anuncia (el lector de pantalla ya leyó el precio visible de la página).
    if (lastAnnounceRef.current === null) {
      lastAnnounceRef.current = Date.now();
      return;
    }
    const elapsed = Date.now() - lastAnnounceRef.current;
    if (elapsed >= PRICE_ANNOUNCE_MS) {
      lastAnnounceRef.current = Date.now();
      setAnnounced(text);
      return;
    }
    // Cambió dentro del cooldown: se agrupa y se anuncia el valor más
    // reciente cuando pase el intervalo.
    const id = window.setTimeout(() => {
      lastAnnounceRef.current = Date.now();
      setAnnounced(text);
    }, PRICE_ANNOUNCE_MS - elapsed);
    return () => window.clearTimeout(id);
  }, [live, text]);

  if (!live) {
    return <span className={cn("num", sizeClass[size], tone, className)}>{text}</span>;
  }

  return (
    <span className={cn("num", sizeClass[size], tone, className)}>
      {/* Precio visible y accesible: se lee al navegar la página. */}
      <span>{text}</span>
      {/* Región viva oculta con throttle: el lector oye el precio cuando
          cambia de verdad, a lo sumo una vez cada PRICE_ANNOUNCE_MS. */}
      <span aria-live="polite" className="sr-only">
        {announced}
      </span>
    </span>
  );
}

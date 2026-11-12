"use client";

import Link from "next/link";

import { formatPercent } from "@/lib/format";

/** Fila del mapa de calor. `change24hPct` es un ratio (0,0123 = +1,23 %), igual que en `Quote`. */
export type MarketHeatmapRow = {
  symbol: string;
  name: string;
  priceUsd: number;
  change24hPct: number;
  priceFormatted: string;
};

/** Esmeralda de marca para alzas. */
const ALZA = { r: 5, g: 150, b: 105 } as const;
/** Coral para bajas. */
const BAJA = { r: 200, g: 30, b: 30 } as const;

/** Luminancia relativa WCAG de un color ya compuesto sobre blanco. */
function luminancia(r: number, g: number, b: number): number {
  const canal = (valor: number) => {
    const s = valor / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/**
 * Elige tinta oscura o blanca según cuál dé más contraste sobre el fondo
 * compuesto. Con la escala atenuada gana la tinta oscura; el cálculo queda
 * para que cualquier ajuste de intensidad siga cumpliendo AA.
 */
function tintaSobre(r: number, g: number, b: number): string {
  const l = luminancia(r, g, b);
  const contrasteBlanco = 1.05 / (l + 0.05);
  const contrasteOscuro = (l + 0.05) / (luminancia(10, 10, 10) + 0.05);
  return contrasteBlanco > contrasteOscuro ? "#ffffff" : "var(--color-fg, #0a0a0a)";
}

/** Compone un canal sobre blanco: las tarjetas viven sobre superficie blanca. */
function sobreBlanco(canal: number, alpha: number): number {
  return Math.round(canal * alpha + 255 * (1 - alpha));
}

/**
 * Estilo de una ficha según la intensidad de la variación (0 % → neutro,
 * ±3 % o más → tope). El tope queda por debajo del color pleno: la ficha se
 * lee como dato, no como semáforo, y la tinta oscura conserva AA.
 */
function estiloTono(change24hPct: number): {
  backgroundColor: string;
  borderColor: string;
  color: string;
} {
  // Dato inválido o sin variación: superficie neutra.
  if (!Number.isFinite(change24hPct) || change24hPct === 0) {
    return {
      backgroundColor: "var(--color-surface-2, #f0f0f0)",
      borderColor: "var(--color-border, #e6e6e6)",
      color: "var(--color-fg, #0a0a0a)",
    };
  }

  // ±3 % (0,03 como ratio) o más llega al tono más fuerte.
  const intensidad = Math.min(1, Math.abs(change24hPct) / 0.03);
  const base = change24hPct > 0 ? ALZA : BAJA;
  const alpha = 0.08 + 0.55 * intensidad;
  const borde = Math.min(0.4, alpha + 0.1);

  return {
    backgroundColor: `rgba(${base.r}, ${base.g}, ${base.b}, ${alpha.toFixed(3)})`,
    borderColor: `rgba(${base.r}, ${base.g}, ${base.b}, ${borde.toFixed(3)})`,
    color: tintaSobre(
      sobreBlanco(base.r, alpha),
      sobreBlanco(base.g, alpha),
      sobreBlanco(base.b, alpha),
    ),
  };
}

function stockPath(symbol: string): string {
  return `/app/accion/${encodeURIComponent(symbol)}`;
}

export function MarketHeatmap({ rows }: { rows: readonly MarketHeatmapRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-fg-muted">Sin datos para el mapa de calor.</p>;
  }

  return (
    <div
      role="list"
      aria-label="Mapa de calor del mercado"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-4"
    >
      {rows.map((row) => {
        const tono = estiloTono(row.change24hPct);
        // formatPercent ya espera un ratio, igual que `Quote.change24hPct`.
        const variacion = formatPercent(row.change24hPct);

        return (
          <Link
            key={row.symbol}
            href={stockPath(row.symbol)}
            role="listitem"
            aria-label={`${row.symbol}, ${row.name}: ${variacion}, ${row.priceFormatted}`}
            style={tono}
            className="flex min-h-24 min-w-0 flex-col justify-between gap-2 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate font-mono text-sm font-semibold tracking-tight" title={row.symbol}>
                {row.symbol}
              </span>
              <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug" title={row.name}>
                {row.name}
              </span>
            </span>
            {/* Variación y precio: apilados en móvil, en una línea desde sm. */}
            <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
              <span className="num text-sm font-medium tabular-nums">{variacion}</span>
              <span className="num text-[13px] tabular-nums">{row.priceFormatted}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

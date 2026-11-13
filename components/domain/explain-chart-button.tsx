"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const MAX_TICKER = 32;
const MAX_NAME = 80;
const MAX_RANGE = 24;

/** Símbolo de catálogo (AAPLx), sin espacios ni rutas. */
function cleanTicker(value: string): string {
  const ticker = value.trim().slice(0, MAX_TICKER);
  return /^[A-Za-z0-9.]+$/.test(ticker) ? ticker : "";
}

function cleanName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

function cleanRange(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_RANGE);
}

/**
 * Pregunta precargada del asistente para el gráfico de la ficha.
 * Sólo arma una URL interna: no consulta datos ni ejecuta compras.
 */
export function explainChartHref(ticker: string, name: string, range?: string): string {
  const symbol = cleanTicker(ticker);
  const label = cleanName(name) || symbol || "esta acción";
  const span = cleanRange(range);
  const subject = symbol ? `${label} (${symbol})` : label;
  const question = span
    ? `Explícame el gráfico de ${subject} en el rango ${span}: qué muestra, cuál fue el máximo y el mínimo y qué significa la variación. Sin recomendaciones.`
    : `Explícame el gráfico de ${subject}: qué muestra, cuál fue el máximo y el mínimo y qué significa la variación. Sin recomendaciones.`;
  const params = new URLSearchParams();
  if (symbol) params.set("ticker", symbol);
  params.set("q", question);
  // Espacios como %20 (no `+`): el asistente los lee igual desde searchParams.
  return `/app/asistente?${params.toString().replace(/\+/g, "%20")}`;
}

/**
 * Botón de la ficha para pedirle al asistente que explique el gráfico del
 * rango activo. Enlaza al asistente con la pregunta escrita; no recomienda.
 */
export function ExplainChartButton({
  ticker,
  name,
  range,
  className,
}: {
  ticker: string;
  name: string;
  range?: string;
  className?: string;
}) {
  const symbol = cleanTicker(ticker);
  const label = cleanName(name) || symbol || "esta acción";
  const ariaLabel = symbol
    ? `Explícame este gráfico de ${label} (${symbol})`
    : `Explícame este gráfico de ${label}`;

  return (
    <Button
      asChild
      variant="secondary"
      size="md"
      className={cn("gap-1.5 whitespace-nowrap", className)}
    >
      <Link href={explainChartHref(ticker, name, range)} aria-label={ariaLabel}>
        <SparkIcon />
        <span className="truncate">Explícame este gráfico</span>
      </Link>
    </Button>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M8 1l1.65 4.35L14 7l-4.35 1.65L8 13l-1.65-4.35L2 7l4.35-1.65L8 1z" />
    </svg>
  );
}

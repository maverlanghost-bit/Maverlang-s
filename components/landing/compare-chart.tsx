"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconShare } from "@/components/ui/icons";
import { getHistories } from "@/lib/api/client";
import { comparisonSeries } from "@/lib/charts/comparison";
import { historyDescription, type FinancialPoint } from "@/lib/charts/data";
import { cn } from "@/lib/cn";

/**
 * Comparador público: rendimiento relativo base 100 del último mes y botón
 * para compartir el enlace.
 *
 * La serie sale de `GET /api/tickers/history` (endpoint público). Sólo se
 * dibuja con observaciones reales (`real: true`), distinguiendo referencias
 * del subyacente y sondeos del token. Si la llamada falla, el gráfico
 * no aparece y el resto de la página sigue igual.
 */

export type CompareChartSide = {
  symbol: string;
  name: string;
  ticker: string;
};

type Series = {
  points: FinancialPoint[];
  /** Variación del rango como ratio: 0,0123 → +1,23 %. */
  change: number | null;
  source?: string;
};

type Comparison = { a: Series; b: Series; bounds: { start: number; end: number } };

type ChartState = "loading" | "ready" | "empty";

const WIDTH = 720;
const HEIGHT = 260;
const PAD_X = 6;
const PAD_TOP = 16;
const PAD_BOTTOM = 16;

const changeFormat = new Intl.NumberFormat("es-CL", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});
const dateFormat = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" });

/** Serie base 100: cada punto vale 100 en el primer precio del rango. */
function baseHundred(points: readonly FinancialPoint[], source?: string): Series | null {
  const clean = points
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p) && point.p > 0)
    .sort((left, right) => left.t - right.t);
  const first = clean[0];
  if (!first || first.gap || clean.length < 2) return null;
  const rebased = clean.map((point) => ({ ...point, p: (point.p / first.p) * 100 }));
  const last = rebased.at(-1);
  if (!last || !Number.isFinite(last.p)) return null;
  return { points: rebased, change: last.gap ? null : last.p / 100 - 1, source };
}

function xAt(time: number, bounds: Comparison["bounds"]): number {
  const inner = WIDTH - PAD_X * 2;
  return PAD_X + ((time - bounds.start) / (bounds.end - bounds.start)) * inner;
}

function yAt(value: number, min: number, span: number): number {
  const inner = HEIGHT - PAD_TOP - PAD_BOTTOM;
  return PAD_TOP + (1 - (value - min) / span) * inner;
}

function linePath(points: readonly FinancialPoint[], bounds: Comparison["bounds"], min: number, span: number): string {
  let move = true;
  const commands: string[] = [];
  for (const point of points) {
    if (point.gap) { move = true; continue; }
    commands.push(`${move ? "M" : "L"}${xAt(point.t, bounds).toFixed(1)} ${yAt(point.p, min, span).toFixed(1)}`);
    move = false;
  }
  return commands.join(" ");
}

type Geometry = {
  leftPath: string;
  rightPath: string;
  leftEnd: { x: number; y: number };
  rightEnd: { x: number; y: number };
  hundredY: number;
};

/**
 * Escala compartida por las dos series: la comparación es visual y honesta.
 * No se rotulan ejes inventados; sólo la línea base 100, porque es el único
 * valor con significado real en una serie normalizada.
 */
function buildGeometry(series: Comparison): Geometry | null {
  const all = [...series.a.points, ...series.b.points].filter((point) => !point.gap).map((point) => point.p);
  const first = all.at(0);
  if (first === undefined) return null;

  let dataMin = first;
  let dataMax = first;
  for (const value of all) {
    if (!Number.isFinite(value)) continue;
    if (value < dataMin) dataMin = value;
    if (value > dataMax) dataMax = value;
  }
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) return null;

  // Un rango muy angosto se abre para que la línea no toque los bordes. La
  // base 100 siempre entra en el encuadre: es la única referencia real.
  const domainMin = Math.min(dataMin, 100);
  const domainMax = Math.max(dataMax, 100);
  const padding = Math.max((domainMax - domainMin) * 0.08, 0.4);
  const min = domainMin - padding;
  const max = domainMax + padding;
  const span = max - min || 1;

  const leftEnd = series.a.points.filter((point) => !point.gap).at(-1);
  const rightEnd = series.b.points.filter((point) => !point.gap).at(-1);
  if (!leftEnd || !rightEnd) return null;

  return {
    leftPath: linePath(series.a.points, series.bounds, min, span),
    rightPath: linePath(series.b.points, series.bounds, min, span),
    leftEnd: {
      x: xAt(leftEnd.t, series.bounds),
      y: yAt(leftEnd.p, min, span),
    },
    rightEnd: {
      x: xAt(rightEnd.t, series.bounds),
      y: yAt(rightEnd.p, min, span),
    },
    hundredY: yAt(100, min, span),
  };
}

function changeTone(value: number | null): string {
  if (value === null) return "text-fg-muted";
  if (value > 0) return "text-up";
  if (value < 0) return "text-down";
  return "text-fg-muted";
}

export function CompareChart({
  a,
  b,
  path,
  className,
}: {
  a: CompareChartSide;
  b: CompareChartSide;
  /** Ruta canónica que se comparte; si falta, se usa la del navegador. */
  path?: string;
  className?: string;
}) {
  const leftSymbol = a.symbol;
  const rightSymbol = b.symbol;
  const key = `${leftSymbol}:${rightSymbol}`;
  const [result, setResult] = useState<{ key: string; state: ChartState; series: Comparison | null }>({ key: "", state: "loading", series: null });
  const { state, series } = result.key === key ? result : { state: "loading", series: null };

  useEffect(() => {
    let cancelled = false;

    getHistories([leftSymbol, rightSymbol], "1M")
      .then((rows) => {
        if (cancelled) return;
        const leftRow = rows.find((row) => row.symbol.toLowerCase() === leftSymbol.toLowerCase());
        const rightRow = rows.find((row) => row.symbol.toLowerCase() === rightSymbol.toLowerCase());
        if (!leftRow?.real || !rightRow?.real) {
          setResult({ key, state: "empty", series: null });
          return;
        }
        const compared = comparisonSeries([
          { id: "left", points: leftRow.points, source: leftRow.source },
          { id: "right", points: rightRow.points, source: rightRow.source },
        ]);
        const left = baseHundred(compared.series[0]?.points ?? [], leftRow.source);
        const right = baseHundred(compared.series[1]?.points ?? [], rightRow.source);
        if (!left || !right || !compared.bounds || compared.unavailable.length > 0) {
          setResult({ key, state: "empty", series: null });
          return;
        }
        setResult({ key, state: "ready", series: { a: left, b: right, bounds: compared.bounds } });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, state: "empty", series: null });
      });

    return () => {
      cancelled = true;
    };
  }, [leftSymbol, rightSymbol, key]);

  const geometry = series ? buildGeometry(series) : null;

  return (
    <section
      aria-labelledby="comparar-grafico-title"
      className={cn("mt-10 border-t border-border pt-8", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h2 id="comparar-grafico-title" className="text-xl text-balance sm:text-2xl">
            Rendimiento relativo
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-pretty text-fg-muted">
            Base 100 al inicio de la ventana común disponible dentro del último mes. Compara la variación de los registros de precio.
          </p>
        </div>
        <ShareCompareButton a={a} b={b} path={path} />
      </div>

      {state === "loading" ? (
        <div className="mt-6">
          <div
            aria-hidden
            className="aspect-[720/260] w-full animate-pulse rounded-xl bg-surface-2 motion-reduce:animate-none"
          />
          <p className="sr-only">Cargando el gráfico de rendimiento relativo…</p>
        </div>
      ) : null}

      {state === "empty" ? (
        <p className="mt-6 max-w-2xl border-t border-border pt-4 text-[13px] leading-relaxed text-pretty text-fg-muted">
          No hay datos públicos de precio suficientes para dibujar la comparación ahora. El resto de la página sigue
          igual.
        </p>
      ) : null}

      {state === "ready" && series && geometry ? (
        <div className="motion-safe:animate-fade-in motion-reduce:animate-none">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="mt-6 h-auto w-full"
            role="img"
            aria-label={`Rendimiento relativo de ${a.name} y ${b.name} en el último mes, base 100`}
          >
            <g aria-hidden="true">
              <line
                x1={PAD_X}
                x2={WIDTH - PAD_X}
                y1={geometry.hundredY}
                y2={geometry.hundredY}
                className="text-border-strong"
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="3 5"
              />
            </g>
            <path
              d={geometry.leftPath}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-fg"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={geometry.rightPath}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="6 4"
              className="text-fg-muted"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={geometry.leftEnd.x} cy={geometry.leftEnd.y} r={2.5} className="text-fg" fill="currentColor" />
            <circle
              cx={geometry.rightEnd.x}
              cy={geometry.rightEnd.y}
              r={2.5}
              className="text-fg-muted"
              fill="currentColor"
            />
          </svg>

          <div aria-hidden className="mt-1 flex justify-between text-[13px] text-fg-muted">
            <time dateTime={new Date(series.bounds.start).toISOString()}>{dateFormat.format(series.bounds.start)}</time>
            <time dateTime={new Date(series.bounds.end).toISOString()}>{dateFormat.format(series.bounds.end)}</time>
          </div>

          <ul className="mt-4 flex flex-col gap-2 text-[13px] sm:flex-row sm:flex-wrap sm:gap-x-6">
            <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span aria-hidden className="h-0.5 w-5 rounded-full bg-fg" />
              <span className="font-medium text-fg">{a.ticker}</span>
              <span className="text-fg-muted">{a.name}</span>
              <span className={cn("num font-medium", changeTone(series.a.change))}>
                {series.a.change === null ? "Sin dato final" : changeFormat.format(series.a.change)}
              </span>
              <span className="text-xs text-fg-muted">{historyDescription(series.a.source, false)}</span>
            </li>
            <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span aria-hidden className="w-5 shrink-0 border-t-2 border-dashed border-fg-muted" />
              <span className="font-medium text-fg">{b.ticker}</span>
              <span className="text-fg-muted">{b.name}</span>
              <span className={cn("num font-medium", changeTone(series.b.change))}>
                {series.b.change === null ? "Sin dato final" : changeFormat.format(series.b.change)}
              </span>
              <span className="text-xs text-fg-muted">{historyDescription(series.b.source, false)}</span>
            </li>
          </ul>

          <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
            Se usa el último registro conocido de cada serie a cada instante de la ventana común, conservando su fecha original. Los huecos largos interrumpen la línea. Base 100 es una escala relativa; los cierres del subyacente son referencias y no operaciones del token.
          </p>
        </div>
      ) : null}
    </section>
  );
}

type ShareStatus = "idle" | "copied" | "error";

/**
 * Botón "Compartir comparación": `navigator.share` si existe y, si no (o si el
 * usuario cancela sin compartir), copia el enlace canónico al portapapeles.
 */
export function ShareCompareButton({
  a,
  b,
  path,
  className,
}: {
  a: CompareChartSide;
  b: CompareChartSide;
  path?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<ShareStatus>("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function share() {
    const url = new URL(path ?? window.location.pathname, window.location.origin).toString();
    const title = `${a.name} vs ${b.name}`;
    const text = `${a.ticker} vs ${b.ticker}: comparación con datos de la SEC y rendimiento relativo`;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        // Cancelar el diálogo no es un error: no se copia nada a espaldas del usuario.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <Button type="button" variant="secondary" size="md" className="gap-2" onClick={() => void share()}>
        <IconShare className="size-4" />
        Compartir comparación
      </Button>
      <p aria-live="polite" className="min-h-5 text-[13px] leading-5 text-fg-muted">
        {status === "copied"
          ? "Enlace copiado."
          : status === "error"
            ? "No se pudo copiar el enlace. Copia la dirección del navegador."
            : ""}
      </p>
    </div>
  );
}

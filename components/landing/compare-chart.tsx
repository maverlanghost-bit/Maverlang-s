"use client";

import { useEffect, useState } from "react";

import { getHistories } from "@/lib/api/client";
import { cn } from "@/lib/cn";

/**
 * Comparador público: rendimiento relativo base 100 del último mes y botón
 * para compartir el enlace.
 *
 * La serie sale de `GET /api/tickers/history` (endpoint público). Sólo se
 * dibuja con series reales (`real: true`): una serie de referencia, vacía o
 * mock no se muestra como si fuera un precio. Si la llamada falla, el gráfico
 * no aparece y el resto de la página sigue igual.
 */

export type CompareChartSide = {
  symbol: string;
  name: string;
  ticker: string;
};

type Series = {
  values: number[];
  /** Variación del rango como ratio: 0,0123 → +1,23 %. */
  change: number;
};

type ChartState = "loading" | "ready" | "empty";

const WIDTH = 720;
const HEIGHT = 260;
const PAD_X = 6;
const PAD_TOP = 16;
const PAD_BOTTOM = 16;

const indexFormat = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const changeFormat = new Intl.NumberFormat("es-CL", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

/** Serie base 100: cada punto vale 100 en el primer precio del rango. */
function baseHundred(points: readonly { t: number; p: number }[]): Series | null {
  const clean = points
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p) && point.p > 0)
    .sort((left, right) => left.t - right.t);
  const first = clean[0];
  if (!first || clean.length < 2) return null;
  const values = clean.map((point) => (point.p / first.p) * 100);
  const last = values.at(-1);
  if (last === undefined || !Number.isFinite(last)) return null;
  return { values, change: last / 100 - 1 };
}

function xAt(index: number, count: number): number {
  const inner = WIDTH - PAD_X * 2;
  return PAD_X + (count <= 1 ? inner / 2 : (index / (count - 1)) * inner);
}

function yAt(value: number, min: number, span: number): number {
  const inner = HEIGHT - PAD_TOP - PAD_BOTTOM;
  return PAD_TOP + (1 - (value - min) / span) * inner;
}

function linePath(values: readonly number[], min: number, span: number): string {
  return values
    .map((value, index) => {
      const x = xAt(index, values.length).toFixed(1);
      const y = yAt(value, min, span).toFixed(1);
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
}

type Geometry = {
  leftPath: string;
  rightPath: string;
  leftEnd: { x: number; y: number };
  rightEnd: { x: number; y: number };
  hundredY: number;
  showHundredLabel: boolean;
  ticks: { value: number; y: number }[];
};

/** Escala compartida por las dos series: la comparación es visual y honesta. */
function buildGeometry(series: { a: Series; b: Series }): Geometry | null {
  const all = [...series.a.values, ...series.b.values];
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

  // Un rango muy angosto se abre para que la línea no toque los bordes.
  const padding = Math.max((dataMax - dataMin) * 0.08, 0.4);
  const min = dataMin - padding;
  const max = dataMax + padding;
  const span = max - min || 1;

  const leftEndValue = series.a.values.at(-1);
  const rightEndValue = series.b.values.at(-1);
  if (leftEndValue === undefined || rightEndValue === undefined) return null;

  const hundredY = yAt(100, min, span);
  const ticks = [max, (max + min) / 2, min].map((value) => ({ value, y: yAt(value, min, span) }));

  return {
    leftPath: linePath(series.a.values, min, span),
    rightPath: linePath(series.b.values, min, span),
    leftEnd: {
      x: xAt(series.a.values.length - 1, series.a.values.length),
      y: yAt(leftEndValue, min, span),
    },
    rightEnd: {
      x: xAt(series.b.values.length - 1, series.b.values.length),
      y: yAt(rightEndValue, min, span),
    },
    hundredY,
    showHundredLabel: ticks.every((tick) => Math.abs(tick.y - hundredY) > 14),
    ticks,
  };
}

function changeTone(value: number): string {
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
  const [state, setState] = useState<ChartState>("loading");
  const [series, setSeries] = useState<{ a: Series; b: Series } | null>(null);
  const leftSymbol = a.symbol;
  const rightSymbol = b.symbol;

  useEffect(() => {
    let cancelled = false;

    getHistories([leftSymbol, rightSymbol], "1M")
      .then((rows) => {
        if (cancelled) return;
        const leftRow = rows.find((row) => row.symbol.toLowerCase() === leftSymbol.toLowerCase());
        const rightRow = rows.find((row) => row.symbol.toLowerCase() === rightSymbol.toLowerCase());
        if (!leftRow?.real || !rightRow?.real) {
          setState("empty");
          return;
        }
        const left = baseHundred(leftRow.points);
        const right = baseHundred(rightRow.points);
        if (!left || !right) {
          setState("empty");
          return;
        }
        setSeries({ a: left, b: right });
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("empty");
      });

    return () => {
      cancelled = true;
    };
  }, [leftSymbol, rightSymbol]);

  const geometry = series ? buildGeometry(series) : null;

  return (
    <section
      aria-labelledby="comparar-grafico-title"
      className={cn("mt-10 rounded-3xl border border-border bg-surface-1 p-6 sm:p-8", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id="comparar-grafico-title" className="text-xl sm:text-2xl">
            Rendimiento relativo
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            Base 100 al primer punto del último mes. Compara cómo se movió cada precio; no es una proyección.
          </p>
        </div>
        <ShareCompareButton a={a} b={b} path={path} />
      </div>

      {state === "loading" ? (
        <div className="mt-6">
          <div
            aria-hidden
            className="aspect-[720/260] w-full animate-pulse rounded-2xl bg-surface-2 motion-reduce:animate-none"
          />
          <p className="sr-only">Cargando el gráfico de rendimiento relativo…</p>
        </div>
      ) : null}

      {state === "empty" ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border px-4 py-6 text-sm leading-relaxed text-fg-muted">
          El gráfico no está disponible ahora: necesita la serie pública de precios de ambos activos. El resto de la
          página sigue igual.
        </p>
      ) : null}

      {state === "ready" && series && geometry ? (
        <>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="mt-6 h-auto w-full"
            role="img"
            aria-label={`Rendimiento relativo de ${a.name} y ${b.name} en el último mes, base 100`}
          >
            <g aria-hidden="true">
              {geometry.ticks.map((tick) => (
                <g key={`${tick.value}-${tick.y}`}>
                  <line
                    x1={PAD_X}
                    x2={WIDTH - PAD_X}
                    y1={tick.y}
                    y2={tick.y}
                    className="text-border"
                    stroke="currentColor"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD_X}
                    y={tick.y - 4}
                    className="num text-fg-subtle"
                    fill="currentColor"
                    fontSize={11}
                  >
                    {indexFormat.format(tick.value)}
                  </text>
                </g>
              ))}
              <line
                x1={PAD_X}
                x2={WIDTH - PAD_X}
                y1={geometry.hundredY}
                y2={geometry.hundredY}
                className="text-border-strong"
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              {geometry.showHundredLabel ? (
                <text
                  x={WIDTH - PAD_X}
                  y={geometry.hundredY - 4}
                  textAnchor="end"
                  className="num text-fg-muted"
                  fill="currentColor"
                  fontSize={11}
                >
                  100
                </text>
              ) : null}
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
              className="text-info"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={geometry.leftEnd.x} cy={geometry.leftEnd.y} r={3} className="text-fg" fill="currentColor" />
            <circle cx={geometry.rightEnd.x} cy={geometry.rightEnd.y} r={3} className="text-info" fill="currentColor" />
          </svg>

          <div aria-hidden className="mt-1 flex justify-between text-[11px] text-fg-subtle">
            <span>Inicio del rango</span>
            <span>Último precio</span>
          </div>

          <ul className="mt-4 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
            <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span aria-hidden className="h-0.5 w-5 rounded-full bg-fg" />
              <span className="font-medium text-fg">{a.ticker}</span>
              <span className="text-fg-muted">{a.name}</span>
              <span className={cn("num font-medium", changeTone(series.a.change))}>
                {changeFormat.format(series.a.change)}
              </span>
            </li>
            <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span aria-hidden className="h-0.5 w-5 rounded-full bg-info" />
              <span className="font-medium text-fg">{b.ticker}</span>
              <span className="text-fg-muted">{b.name}</span>
              <span className={cn("num font-medium", changeTone(series.b.change))}>
                {changeFormat.format(series.b.change)}
              </span>
            </li>
          </ul>

          <p className="mt-3 text-[11px] leading-relaxed text-fg-muted">
            Series públicas de precios, base 100 al primer punto del rango. Las dos series pueden tener horarios
            distintos.
          </p>
        </>
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
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      <button
        type="button"
        onClick={() => void share()}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-bg px-4 text-sm font-medium text-fg transition duration-[140ms] ease-spring hover:border-border-strong hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:outline-none active:scale-[0.98]"
      >
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 2v8" />
          <path d="m4.8 5.2 3.2-3.2 3.2 3.2" />
          <path d="M3 10.5v2.2c0 .7.6 1.3 1.3 1.3h7.4c.7 0 1.3-.6 1.3-1.3v-2.2" />
        </svg>
        Compartir comparación
      </button>
      <p aria-live="polite" className="text-xs text-fg-muted">
        {status === "copied"
          ? "Enlace copiado."
          : status === "error"
            ? "No se pudo copiar el enlace. Copia la dirección del navegador."
            : ""}
      </p>
    </div>
  );
}

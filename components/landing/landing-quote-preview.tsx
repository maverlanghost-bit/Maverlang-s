"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { SvgPriceChart, type ChartPoint } from "@/components/domain/svg-price-chart";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { TradingViewChart } from "@/components/domain/tradingview-chart";
import { useLandingQuote } from "@/components/landing/live-landing-prices";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatMoney, formatPercent } from "@/lib/format";
import { useHistory } from "@/lib/hooks/queries";
import type { ChartOverlay } from "@/lib/market/chart-geometry";
import type { LandingQuote } from "@/lib/mocks/landing";

const SAMPLE_AMOUNTS = [10, 50, 100, 500] as const;

const PILLS = ["Comisión: 0%", "Liquidación: Solana SPL", "Horario: 24/7"] as const;

const RANGE_OPTIONS = [
  { value: "1D", label: "1D" },
  { value: "1W", label: "1S" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "1Y", label: "1A" },
] as const;

type LandingRange = (typeof RANGE_OPTIONS)[number]["value"];

const RANGE_NAMES: Record<LandingRange, string> = {
  "1D": "1 día",
  "1W": "1 semana",
  "1M": "1 mes",
  "3M": "3 meses",
  "1Y": "1 año",
};

const RANGE_SPAN_MS: Record<LandingRange, number> = {
  "1D": 24 * 3_600_000,
  "1W": 7 * 24 * 3_600_000,
  "1M": 30 * 24 * 3_600_000,
  "3M": 90 * 24 * 3_600_000,
  "1Y": 365 * 24 * 3_600_000,
};

/** Amplitud del vaivén de la curva de referencia, como fracción del precio. */
const RANGE_WOBBLE: Record<LandingRange, number> = {
  "1D": 0.004,
  "1W": 0.008,
  "1M": 0.013,
  "3M": 0.018,
  "1Y": 0.026,
};

/** Curva de referencia determinista: siempre 28 puntos y el último es el precio mostrado. */
const REFERENCE_POINTS = 28;

/** Motores del gráfico: la vista propia y el widget embebido de TradingView. */
const PROVIDER_OPTIONS = [
  { value: "native", label: "Gráfico Pro" },
  { value: "tradingview", label: "TradingView" },
] as const;

type ChartProvider = (typeof PROVIDER_OPTIONS)[number]["value"];

/** Eje Y: precio en dólares o variación porcentual del período. */
type AxisMode = "price" | "percent";

/**
 * Comparación rápida de la portada. El color es estable por activo para que la
 * curva no cambie de tono al agregar o quitar otra comparación.
 */
const QUICK_COMPARE = [
  { symbol: "SPYx", name: "S&P 500", color: "#2563eb" },
  { symbol: "QQQx", name: "Nasdaq 100", color: "#7c3aed" },
  { symbol: "NVDAx", name: "NVIDIA", color: "#d97706" },
  { symbol: "AAPLx", name: "Apple", color: "#2563eb" },
  { symbol: "TSLAx", name: "Tesla", color: "#7c3aed" },
  { symbol: "GLDx", name: "Oro", color: "#d97706" },
] as const;

/** Tope de series comparadas para que el gráfico siga legible. */
const QUICK_COMPARE_MAX = 3;

const CHIP_BASE =
  "inline-flex min-h-11 touch-manipulation items-center justify-center rounded-full border px-4 text-sm font-medium tabular-nums outline-none transition-colors duration-[140ms] ease-spring focus-visible:ring-4 focus-visible:ring-fg/20 motion-safe:active:scale-[0.98] motion-reduce:transition-none";

const CONTROL_BASE =
  "inline-flex h-9 touch-manipulation items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none transition-colors duration-[140ms] ease-spring focus-visible:ring-4 focus-visible:ring-fg/20 motion-safe:active:scale-[0.98] motion-reduce:transition-none";

const CONTROL_ON = "border-fg bg-fg text-bg";
const CONTROL_OFF = "border-border bg-bg text-fg-muted hover:border-border-strong hover:text-fg";

const RANGE_BASE =
  "inline-flex h-9 min-w-10 touch-manipulation items-center justify-center rounded-full border px-2.5 text-xs font-medium tabular-nums outline-none transition-colors duration-[140ms] ease-spring focus-visible:ring-4 focus-visible:ring-fg/20 motion-safe:active:scale-[0.98] motion-reduce:transition-none";

const COMPARE_PILL_BASE =
  "inline-flex min-h-9 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium outline-none transition-colors duration-[140ms] ease-spring focus-visible:ring-2 focus-visible:ring-fg/30 motion-safe:active:scale-[0.98] motion-reduce:transition-none";

const CHART_HEIGHT_REST = "h-60 sm:h-72 md:h-80";
const CHART_HEIGHT_FULLSCREEN = "h-[64vh] min-h-[420px]";

const POINT_TIME = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Santiago",
});

function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Serie sintética pero determinista para el período: el mismo símbolo y rango
 * dibujan la misma forma. Termina exacto en `priceUsd` y parte en
 * `priceUsd / (1 + change)`, con un vaivén suave que se anula en los extremos.
 */
function buildReferenceCurve(
  symbol: string,
  range: LandingRange,
  priceUsd: number,
  change: number,
): ChartPoint[] {
  const base = Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : 1;
  const rawChange = Number.isFinite(change) ? change : 0;
  const effectiveChange = 1 + rawChange > 0 ? rawChange : 0;
  const start = base / (1 + effectiveChange);
  const delta = base - start;

  const hash = fnv1a(`${symbol}:${range}`);
  const phase = (hash % 6283) / 1000;
  const cyclesA = 2 + ((hash >>> 8) % 3);
  const cyclesB = 5 + ((hash >>> 16) % 4);
  const mix = 0.62 + ((hash >>> 24) % 18) / 100;
  const amplitude = Math.max(Math.abs(delta) * 0.35, base * RANGE_WOBBLE[range]);

  // Ancla a la hora en curso: estable entre renders y entre servidor y cliente.
  const end = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const span = RANGE_SPAN_MS[range];
  const step = span / (REFERENCE_POINTS - 1);

  const points: ChartPoint[] = [];
  for (let index = 0; index < REFERENCE_POINTS; index += 1) {
    const u = index / (REFERENCE_POINTS - 1);
    const envelope = Math.sin(Math.PI * u) ** 2;
    const wave =
      Math.sin(phase + u * Math.PI * cyclesA) * mix +
      Math.sin(phase * 1.7 + u * Math.PI * cyclesB) * (1 - mix);
    const price = start + delta * u + envelope * amplitude * wave;
    points.push({
      t: end - span + step * index,
      p: Number.isFinite(price) && price > 0 ? price : base,
    });
  }

  const first = points[0];
  if (first) first.p = start;
  const last = points[REFERENCE_POINTS - 1];
  if (last) last.p = base;
  return points;
}

/**
 * Pendiente determinista de la curva comparada. La serie se rebasa a % sobre
 * su primer punto, así que sólo importa la forma, no el nivel de precio.
 */
function compareReferenceChange(symbol: string, range: LandingRange): number {
  const hash = fnv1a(`${symbol}:${range}:compare`);
  return ((hash % 1801) - 800) / 10_000;
}

function compareLayerId(symbol: string): string {
  return `compare-${symbol}`;
}

function pointTime(t: number): string {
  if (!Number.isFinite(t)) return "";
  const date = new Date(t);
  if (Number.isNaN(date.getTime())) return "";
  return POINT_TIME.format(date);
}

/** `formatPercent` agrega signo; la amplitud es un ancho, no una variación. */
function plainPercent(ratio: number): string {
  return formatPercent(ratio).replace(/^\+/, "");
}

function signedUsd(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatMoney(Math.abs(value), "USD")}`;
}

/**
 * Ficha de ejemplo con gráfico interactivo del período: precio en vivo,
 * variación en dólares desde la apertura, métricas calculadas sobre la serie
 * visible y lector del punto bajo el cursor. Si el historial no responde, la
 * curva de referencia mantiene el gráfico visible.
 *
 * Incluye un simulador visual de fracciones: el monto elegido (US$10–500) se
 * divide por el precio actual para estimar cuántas acciones tokenizadas
 * equivalen a ese monto. Es un cálculo referencial; no envía órdenes.
 */
export function LandingQuotePreview({ quote }: { quote: LandingQuote }) {
  const { priceUsd, change } = useLandingQuote(quote.symbol, {
    priceUsd: quote.priceUsd,
    change: quote.change,
  });

  const [range, setRange] = useState<LandingRange>("1M");
  const [showAvg, setShowAvg] = useState(false);
  const [showScale, setShowScale] = useState(false);
  const [hover, setHover] = useState<ChartPoint | null>(null);
  const [sampleUsd, setSampleUsd] = useState(100);
  const [provider, setProvider] = useState<ChartProvider>("native");
  const [axisMode, setAxisMode] = useState<AxisMode>("price");
  const [fullscreen, setFullscreen] = useState(false);
  const [comparedSymbols, setComparedSymbols] = useState<string[]>([]);
  const [highlightedLayerId, setHighlightedLayerId] = useState<string | null>(null);

  const chartCardRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);

  const closeFullscreen = useCallback(() => {
    restoreFocus.current = true;
    setFullscreen(false);
  }, []);

  // Al salir, el foco vuelve a la tarjeta que quedó en su lugar en la página.
  useEffect(() => {
    if (fullscreen || !restoreFocus.current) return;
    restoreFocus.current = false;
    chartCardRef.current?.focus({ preventScroll: true });
  }, [fullscreen]);

  // `Escape` cierra la vista ampliada. El listener se retira al salir o desmontar.
  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeFullscreen();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen, closeFullscreen]);

  // La página de fondo no hace scroll mientras el gráfico ocupa la pantalla.
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen]);

  const history = useHistory(quote.symbol, range);

  const chartData = useMemo<ChartPoint[]>(() => {
    const raw = history.data?.points;
    const live = Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : null;

    if (raw && raw.length >= 2) {
      const rows: ChartPoint[] = [];
      for (const point of raw) {
        if (!point || !Number.isFinite(point.t) || !Number.isFinite(point.p) || point.p <= 0) continue;
        rows.push({ t: point.t < 1e12 ? point.t * 1000 : point.t, p: point.p });
      }
      rows.sort((a, b) => a.t - b.t);
      if (rows.length >= 2) {
        if (live !== null) {
          const last = rows[rows.length - 1];
          if (last) rows[rows.length - 1] = { ...last, p: live };
        }
        return rows;
      }
    }

    return buildReferenceCurve(quote.symbol, range, live ?? priceUsd, change);
  }, [history.data, priceUsd, quote.symbol, range, change]);

  const stats = useMemo(() => {
    let high = Number.NEGATIVE_INFINITY;
    let low = Number.POSITIVE_INFINITY;
    let sum = 0;
    let count = 0;
    for (const point of chartData) {
      if (!Number.isFinite(point.p) || point.p <= 0) continue;
      if (point.p > high) high = point.p;
      if (point.p < low) low = point.p;
      sum += point.p;
      count += 1;
    }
    const openRaw = chartData[0]?.p;
    const closeRaw = chartData[chartData.length - 1]?.p;
    return {
      open: openRaw !== undefined && Number.isFinite(openRaw) ? openRaw : null,
      close: closeRaw !== undefined && Number.isFinite(closeRaw) ? closeRaw : null,
      high: count > 0 ? high : null,
      low: count > 0 ? low : null,
      avg: count > 0 ? sum / count : null,
    };
  }, [chartData]);

  const activeChangePct = useMemo(() => {
    const { open, close } = stats;
    if (open !== null && close !== null && open > 0) {
      const ratio = (close - open) / open;
      if (Number.isFinite(ratio)) return ratio;
    }
    return Number.isFinite(change) ? change : 0;
  }, [stats, change]);

  const lastT = chartData[chartData.length - 1]?.t ?? 0;

  const onHover = useCallback(
    (usd: number | null, timeMs?: number | null) => {
      if (usd == null || !Number.isFinite(usd)) {
        setHover(null);
        return;
      }
      setHover({ p: usd, t: timeMs ?? lastT });
    },
    [lastT],
  );

  /** Comparaciones disponibles, sin repetir el activo de la ficha. */
  const compareOptions = useMemo(
    () => QUICK_COMPARE.filter((option) => option.symbol !== quote.symbol),
    [quote.symbol],
  );

  const compareActive = comparedSymbols.length > 0;

  /**
   * Con varias series el eje se lee en % desde la apertura: mezclar dólares de
   * distintos activos en la misma escala no significaría nada.
   */
  const effectiveAxisMode: AxisMode = compareActive ? "percent" : axisMode;

  const compareOverlays = useMemo<ChartOverlay[]>(() => {
    return comparedSymbols.flatMap((symbol) => {
      const option = QUICK_COMPARE.find((item) => item.symbol === symbol);
      if (!option) return [];
      return [
        {
          id: compareLayerId(symbol),
          points: buildReferenceCurve(symbol, range, 100, compareReferenceChange(symbol, range)),
          color: option.color,
          label: symbol,
          rebased: true,
        },
      ];
    });
  }, [comparedSymbols, range]);

  const toggleCompare = useCallback((symbol: string) => {
    setHighlightedLayerId(null);
    setComparedSymbols((previous) => {
      if (previous.includes(symbol)) return previous.filter((item) => item !== symbol);
      if (previous.length >= QUICK_COMPARE_MAX) return previous;
      return [...previous, symbol];
    });
  }, []);

  const priceValid = Number.isFinite(priceUsd) && priceUsd > 0;
  const fractions = priceValid ? (sampleUsd / priceUsd).toFixed(4) : "—";

  const shownPrice = hover !== null && Number.isFinite(hover.p) ? hover.p : priceUsd;
  const deltaUsd =
    stats.open !== null && Number.isFinite(shownPrice) ? shownPrice - stats.open : null;
  const deltaLabel = deltaUsd !== null && Number.isFinite(deltaUsd) ? signedUsd(deltaUsd) : null;
  const amplitude =
    stats.high !== null && stats.low !== null && stats.low > 0
      ? plainPercent((stats.high - stats.low) / stats.low)
      : "—";

  const chartLabel = `Historial de precio de ${quote.symbol} en ${RANGE_NAMES[range]}`;

  const chartHeightClass = fullscreen ? CHART_HEIGHT_FULLSCREEN : CHART_HEIGHT_REST;

  const rangeGroup = (
    <div
      role="group"
      aria-label="Rango del gráfico"
      className="inline-flex w-full items-center justify-between gap-0.5 rounded-full border border-border/70 bg-bg p-0.5 sm:w-auto sm:justify-start"
    >
      {RANGE_OPTIONS.map((option) => {
        const active = option.value === range;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              setHover(null);
              setRange(option.value);
            }}
            className={cn(
              RANGE_BASE,
              active
                ? "border-fg bg-fg text-bg"
                : "border-transparent text-fg-muted hover:border-border hover:text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  const providerGroup = (
    <div
      role="group"
      aria-label="Proveedor del gráfico"
      className="inline-flex items-center gap-0.5 rounded-full border border-border/70 bg-bg p-0.5"
    >
      {PROVIDER_OPTIONS.map((option) => {
        const active = provider === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              setHover(null);
              setProvider(option.value);
            }}
            className={cn(
              RANGE_BASE,
              active
                ? "border-fg bg-fg text-bg"
                : "border-transparent text-fg-muted hover:border-border hover:text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  const avgButton = (
    <button
      type="button"
      aria-pressed={showAvg}
      onClick={() => setShowAvg((value) => !value)}
      className={cn(CONTROL_BASE, showAvg ? CONTROL_ON : CONTROL_OFF)}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", showAvg ? "bg-[#c9dcff]" : "bg-[#2b7fd9]")}
      />
      Promedio
    </button>
  );

  const scaleButton = (
    <button
      type="button"
      aria-pressed={showScale}
      onClick={() => setShowScale((value) => !value)}
      className={cn(CONTROL_BASE, showScale ? CONTROL_ON : CONTROL_OFF)}
    >
      Escala
    </button>
  );

  const axisButton = (
    <button
      type="button"
      aria-pressed={effectiveAxisMode === "percent"}
      aria-disabled={compareActive}
      disabled={compareActive}
      title={
        compareActive
          ? "La comparación se lee en porcentaje"
          : effectiveAxisMode === "percent"
            ? "Eje en porcentaje. Cambiar a dólares"
            : "Eje en dólares. Cambiar a porcentaje"
      }
      aria-label={
        compareActive
          ? "Eje en porcentaje fijado por la comparación"
          : effectiveAxisMode === "percent"
            ? "Eje en porcentaje. Cambiar a dólares"
            : "Eje en dólares. Cambiar a porcentaje"
      }
      onClick={() => setAxisMode((value) => (value === "percent" ? "price" : "percent"))}
      className={cn(
        CONTROL_BASE,
        effectiveAxisMode === "percent" ? CONTROL_ON : CONTROL_OFF,
        compareActive && "cursor-not-allowed opacity-70",
      )}
    >
      <span aria-hidden>%</span>
      <span aria-hidden className="opacity-50">/</span>
      <span aria-hidden>$</span>
    </button>
  );

  const controlsGroup = (
    <div role="group" aria-label="Controles del gráfico" className="flex w-full min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-auto sm:flex-wrap sm:pb-0">
      {avgButton}
      {scaleButton}
      {providerGroup}
      {axisButton}
    </div>
  );

  /** Comparación rápida: el activo de la ficha y hasta tres series más. */
  const compareStrip = (
    <div
      role="group"
      aria-label="Comparar con otros activos"
      className="mb-2 flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:pb-0"
    >
      <span className="shrink-0 text-[11px] font-medium text-fg-muted">+ Comparar:</span>
      {compareActive ? (
        <button
          type="button"
          aria-pressed={highlightedLayerId === "asset"}
          aria-label={`Enfocar la curva de ${quote.symbol}`}
          onMouseEnter={() => setHighlightedLayerId("asset")}
          onMouseLeave={() => setHighlightedLayerId(null)}
          onFocus={() => setHighlightedLayerId("asset")}
          onBlur={() => setHighlightedLayerId(null)}
          onClick={() => setHighlightedLayerId((value) => (value === "asset" ? null : "asset"))}
          className={cn(
            COMPARE_PILL_BASE,
            highlightedLayerId === "asset"
              ? "border-fg bg-fg text-bg"
              : "border-border bg-bg text-fg",
          )}
        >
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", activeChangePct >= 0 ? "bg-up" : "bg-down")}
          />
          {quote.symbol}
        </button>
      ) : null}
      {compareOptions.map((option) => {
        const selected = comparedSymbols.includes(option.symbol);
        const atLimit = !selected && comparedSymbols.length >= QUICK_COMPARE_MAX;
        const layerId = compareLayerId(option.symbol);
        const focused = highlightedLayerId === layerId;

        if (selected) {
          return (
            <div
              key={option.symbol}
              role="group"
              aria-label={`${option.symbol} en la comparación`}
              onMouseEnter={() => setHighlightedLayerId(layerId)}
              onMouseLeave={() => setHighlightedLayerId(null)}
              style={{ borderColor: option.color, backgroundColor: `${option.color}14` }}
              className={cn(
                COMPARE_PILL_BASE,
                "border-transparent pr-1 text-fg",
                focused && "ring-1 ring-fg/20",
              )}
            >
              <button
                type="button"
                aria-pressed={focused}
                aria-label={`Enfocar la curva de ${option.symbol}`}
                onClick={() => setHighlightedLayerId(focused ? null : layerId)}
                onFocus={() => setHighlightedLayerId(layerId)}
                onBlur={() => setHighlightedLayerId(null)}
                className="inline-flex min-h-6 touch-manipulation items-center gap-1.5 rounded-full px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-fg/30"
              >
                <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: option.color }} />
                {option.symbol}
              </button>
              <button
                type="button"
                title={`Quitar ${option.name}`}
                aria-label={`Quitar ${option.name}`}
                onClick={() => toggleCompare(option.symbol)}
                className="inline-flex size-6 touch-manipulation items-center justify-center rounded-full text-fg-muted outline-none transition-colors hover:bg-fg/[0.06] hover:text-fg focus-visible:ring-2 focus-visible:ring-fg/30"
              >
                ×
              </button>
            </div>
          );
        }

        return (
          <button
            key={option.symbol}
            type="button"
            aria-pressed={selected}
            disabled={atLimit}
            title={
              atLimit
                ? `Máximo ${QUICK_COMPARE_MAX} activos en la comparación`
                : `Comparar con ${option.name}`
            }
            onClick={() => toggleCompare(option.symbol)}
            className={cn(
              COMPARE_PILL_BASE,
              "border-border bg-bg text-fg-muted hover:border-border-strong hover:text-fg",
              atLimit && "cursor-not-allowed opacity-50",
            )}
          >
            <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: option.color }} />
            {`+ ${option.symbol}`}
          </button>
        );
      })}
      {compareActive ? (
        <button
          type="button"
          onClick={() => {
            setHighlightedLayerId(null);
            setComparedSymbols([]);
          }}
          className="inline-flex touch-manipulation items-center rounded-full px-2 py-1 text-[11px] font-medium text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-fg/30"
        >
          Limpiar
        </button>
      ) : null}
    </div>
  );

  const priceDisplay = (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {hover ? (
          <span className="num px-1 text-4xl tracking-tight tabular-nums text-fg sm:text-5xl">
            {formatMoney(hover.p, "USD")}
          </span>
        ) : (
          <FlashPrice value={priceUsd} currency="USD" size="lg" />
        )}
        <span className="pb-1 text-xs text-fg-muted">
          {hover ? pointTime(hover.t) : "por acción"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <ChangeBadge value={activeChangePct} />
        {deltaLabel ? (
          <span
            className={cn(
              "num text-sm font-medium tabular-nums",
              deltaUsd !== null && deltaUsd >= 0 ? "text-up" : "text-down",
            )}
          >
            {deltaLabel}
          </span>
        ) : null}
        <span className="text-xs text-fg-muted">desde la apertura del período</span>
      </div>
    </div>
  );

  /**
   * La tarjeta del gráfico. En pantalla completa se monta en un portal sobre
   * `document.body`: las animaciones de entrada de la sección dejan un
   * `transform` en los ancestros y eso encerraría un `fixed` dentro de la
   * tarjeta en vez de cubrir la ventana.
   */
  const chartCard = (
    <div
      ref={chartCardRef}
      tabIndex={-1}
      className={cn(
        "rounded-3xl border border-border/70 bg-surface-1 p-3 outline-none sm:p-4",
        fullscreen &&
          "fixed inset-0 z-[100] flex h-screen w-screen flex-col justify-between overflow-y-auto rounded-none border-0 bg-bg p-5 sm:p-8",
      )}
      role={fullscreen ? "dialog" : undefined}
      aria-modal={fullscreen ? true : undefined}
      aria-label={fullscreen ? `Gráfico ampliado de ${quote.symbol}` : undefined}
    >
      {fullscreen ? (
        <header className="mb-3 flex flex-col gap-3 border-b border-border/60 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <TickerLogo
                symbol={quote.symbol}
                name={quote.name}
                logoUrl={quote.logo}
                size={36}
                decorative
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg">
                  {quote.name} ({quote.symbol})
                </p>
                <p className="truncate text-xs text-fg-muted">
                  {RANGE_NAMES[range]} <span aria-hidden>·</span>{" "}
                  {effectiveAxisMode === "percent" ? "Variación %" : "Precio en US$"}
                </p>
              </div>
            </div>
            {rangeGroup}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {controlsGroup}
            <button
              type="button"
              autoFocus
              onClick={closeFullscreen}
              className={cn(CONTROL_BASE, CONTROL_OFF)}
            >
              Cerrar pantalla completa (Esc)
            </button>
          </div>
        </header>
      ) : null}

      {fullscreen ? <div className="mb-3">{priceDisplay}</div> : null}

      <div className={cn("relative", provider === "tradingview" && "hidden")}>
        {compareStrip}
        <SvgPriceChart
          points={chartData}
          tone={activeChangePct >= 0 ? "up" : "down"}
          label={chartLabel}
          emptyLabel="Sin datos de precio"
          onHover={onHover}
          heightClassName={chartHeightClass}
          showGrid={showScale}
          periodAvgUsd={showAvg && !compareActive ? stats.avg : null}
          axisMode={effectiveAxisMode}
          overlays={compareOverlays}
          showExtremes={false}
          highlightedLayerId={highlightedLayerId}
          onHighlightLayer={setHighlightedLayerId}
          onToggleFullscreen={() => setFullscreen((value) => !value)}
          isFullscreen={fullscreen}
        />
      </div>

      {provider === "tradingview" ? (
        <TradingViewChart
          symbol={quote.symbol}
          underlying={quote.underlying}
          range={range}
          fullscreen={fullscreen}
        />
      ) : null}

      <dl
        aria-label="Métricas del período"
        className={cn(
          "mt-3 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-border/60 pt-3 sm:grid-cols-4",
          fullscreen && "mt-auto pt-4",
        )}
      >
        <div>
          <dt className="text-[11px] font-medium text-fg-muted">Apertura período</dt>
          <dd className="num mt-0.5 text-xs font-semibold tabular-nums text-fg sm:text-sm">
            {stats.open === null ? "—" : formatMoney(stats.open, "USD")}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium text-fg-muted">Promedio período</dt>
          <dd className="num mt-0.5 text-xs font-semibold tabular-nums text-fg sm:text-sm">
            {stats.avg === null ? "—" : formatMoney(stats.avg, "USD")}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium text-fg-muted">Máx / Mín</dt>
          <dd className="num mt-0.5 text-xs font-semibold leading-snug tabular-nums text-fg sm:text-sm">
            {stats.high === null ? "—" : formatMoney(stats.high, "USD")}
            <span className="text-fg-muted"> · </span>
            {stats.low === null ? "—" : formatMoney(stats.low, "USD")}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium text-fg-muted">Amplitud del rango</dt>
          <dd className="num mt-0.5 text-xs font-semibold tabular-nums text-fg sm:text-sm">{amplitude}</dd>
        </div>
      </dl>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <TickerLogo symbol={quote.symbol} name={quote.name} logoUrl={quote.logo} size={48} decorative />
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-fg">{quote.name}</p>
              <p className="truncate text-sm text-fg-muted">
                {quote.symbol} <span aria-hidden>·</span> {quote.underlying}
              </p>
            </div>
          </div>
          {controlsGroup}
          {/* En móvil no hay hover: el botón de la esquina no se ve, así que
              queda esta entrada explícita a pantalla completa. */}
          {fullscreen ? null : (
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className={cn(CONTROL_BASE, CONTROL_OFF, "sm:hidden")}
            >
              Pantalla completa
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          {priceDisplay}
          {rangeGroup}
        </div>
      </div>

      {fullscreen ? createPortal(chartCard, document.body) : chartCard}

      <div className="flex flex-col gap-4 border-t border-border/70 pt-5">
        <div className="flex flex-col gap-2">
          <p className="label">Monto de ejemplo</p>
          <div role="group" aria-label="Monto de ejemplo en dólares" className="flex flex-wrap gap-2">
            {SAMPLE_AMOUNTS.map((amount) => {
              const active = sampleUsd === amount;
              return (
                <button
                  key={amount}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSampleUsd(amount)}
                  className={cn(
                    CHIP_BASE,
                    active
                      ? "border-fg bg-fg text-bg"
                      : "border-border bg-bg text-fg-body hover:border-border-strong hover:text-fg",
                  )}
                >
                  US${amount}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface-1 p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-sm text-fg-muted">Equivale a</p>
            <p className="font-mono text-xs tabular-nums text-fg-muted">
              {priceValid ? `${quote.symbol} · US$${sampleUsd}` : quote.symbol}
            </p>
          </div>

          <p aria-live="polite" className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-fg">
            <span className="font-mono text-2xl font-medium tabular-nums tracking-tight sm:text-3xl md:text-4xl">
              {fractions}
            </span>
            <span className="text-sm font-medium">{quote.symbol}</span>
            <span className="text-sm text-fg-muted">acciones tokenizadas</span>
          </p>

          <p className="mt-3 text-xs leading-relaxed text-fg-muted">Cálculo referencial al precio mostrado.</p>

          <ul className="mt-4 flex flex-wrap gap-2 border-t border-border/70 pt-4">
            {PILLS.map((pill) => (
              <li
                key={pill}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 py-1 text-xs text-fg-body"
              >
                <span className="size-1.5 rounded-full bg-fg/40" aria-hidden />
                {pill}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className={buttonClasses({ size: "md", className: "pointer-events-none min-h-11" })} aria-hidden>
          Comprar
        </span>
        <Link
          href={quote.href}
          className="inline-flex min-h-11 items-center rounded-full border border-border bg-bg px-4 text-sm font-medium text-fg outline-none transition-colors duration-[140ms] ease-spring hover:border-border-strong focus-visible:ring-4 focus-visible:ring-fg/20 motion-reduce:transition-none"
        >
          Ver ficha completa de {quote.symbol} →
        </Link>
        <p className="text-sm text-fg-muted">Botón de ejemplo. No envía una orden.</p>
      </div>
    </div>
  );
}

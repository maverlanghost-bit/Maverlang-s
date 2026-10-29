"use client";

import { InfoTip } from "@/components/domain/info-tip";
import { Skeleton } from "@/components/ui/skeleton";
import type { GraficoCopy } from "@/content/i18n/extra-grafico";
import { cn } from "@/lib/cn";
import { BENCHMARK_COLOR, CHART_W, plotRsiLine, RSI_H, yForRsi } from "@/lib/market/chart-geometry";
import type { SmaPeriod } from "@/lib/market/indicators";

/** Colores de la paleta (info, aviso, texto secundario, texto principal). */
export const SMA_COLOR: Record<SmaPeriod, string> = {
  20: "var(--color-info, #2b7fd9)",
  50: "var(--color-warn, #99651a)",
  200: "var(--color-fg-muted, #6b6b6b)",
};

export const RSI_COLOR = "var(--color-fg, #0a0a0a)";
const RSI_GUIDE = "#e5e5e5";
const RSI_LEVELS = [30, 70] as const;

/** Alto fijo de la fila de chips: el skeleton y los toggles ocupan lo mismo. */
const STUDY_ROW = "mb-3 flex h-11 min-w-0 max-w-full items-center gap-1";
const STUDY_SCROLL =
  "flex h-8 min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function StudyChip({
  pressed,
  onClick,
  label,
  color,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
  color: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap outline-none transition duration-150 ease-spring focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]",
        pressed ? "border-transparent bg-surface-2 text-fg" : "border-border/70 bg-white text-fg-muted hover:text-fg",
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </button>
  );
}

function StyleSwitch({
  label,
  value,
  line,
  candles,
  onChange,
}: {
  label: string;
  value: "line" | "candles";
  line: string;
  candles: string;
  onChange: (value: "line" | "candles") => void;
}) {
  const options = [
    ["line", line],
    ["candles", candles],
  ] as const;
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full border border-border/70 bg-surface-1/80 p-0.5"
    >
      {options.map(([id, text]) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(id)}
            className={cn(
              "h-7 shrink-0 rounded-full px-2.5 text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-4 focus-visible:ring-fg/20",
              selected ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
            )}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

export function StudiesSkeleton({ label }: { label: string }) {
  return (
    <div className={STUDY_ROW} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className={STUDY_SCROLL} aria-hidden>
        <Skeleton className="h-8 w-24 shrink-0 rounded-full" />
        <Skeleton className="h-8 w-16 shrink-0 rounded-full" />
        <Skeleton className="h-8 w-16 shrink-0 rounded-full" />
        <Skeleton className="h-8 w-14 shrink-0 rounded-full" />
      </div>
      <Skeleton className="size-11 shrink-0 rounded-full" />
    </div>
  );
}

export function ChartStudyBar({
  copy,
  spy,
  spyPending = false,
  smas,
  rsi,
  volume = null,
  style = null,
}: {
  copy: GraficoCopy;
  spy: { on: boolean; onToggle: () => void } | null;
  spyPending?: boolean;
  smas: readonly { period: SmaPeriod; on: boolean; onToggle: () => void }[];
  rsi: { on: boolean; onToggle: () => void } | null;
  volume?: { on: boolean; onToggle: () => void; label: string } | null;
  style?: {
    value: "line" | "candles";
    line: string;
    candles: string;
    label: string;
    onChange: (value: "line" | "candles") => void;
  } | null;
}) {
  if (!spy && !spyPending && smas.length === 0 && !rsi && !volume && !style) return null;
  const smaLabel: Record<SmaPeriod, string> = {
    20: copy.sma20,
    50: copy.sma50,
    200: copy.sma200,
  };

  return (
    <div className={STUDY_ROW}>
      <div role="group" aria-label={copy.tools} className={STUDY_SCROLL}>
        {style ? (
          <StyleSwitch
            label={style.label}
            value={style.value}
            line={style.line}
            candles={style.candles}
            onChange={style.onChange}
          />
        ) : null}
        {spyPending ? <Skeleton className="h-8 w-24 shrink-0 rounded-full" /> : null}
        {spy ? <StudyChip pressed={spy.on} onClick={spy.onToggle} label={copy.vsSpy} color={BENCHMARK_COLOR} /> : null}
        {smas.map((item) => (
          <StudyChip
            key={item.period}
            pressed={item.on}
            onClick={item.onToggle}
            label={smaLabel[item.period]}
            color={SMA_COLOR[item.period]}
          />
        ))}
        {rsi ? <StudyChip pressed={rsi.on} onClick={rsi.onToggle} label={copy.rsi} color={RSI_COLOR} /> : null}
        {volume ? (
          <StudyChip pressed={volume.on} onClick={volume.onToggle} label={volume.label} color={BENCHMARK_COLOR} />
        ) : null}
      </div>
      <InfoTip label={copy.tipLabel} text={copy.tip} className="shrink-0" />
    </div>
  );
}

export function ChartLegend({
  label,
  items,
}: {
  label: string;
  items: readonly { id: string; label: string; color: string; dashed?: boolean }[];
}) {
  if (items.length === 0) return null;
  return (
    <ul
      aria-label={label}
      className="mt-2 flex max-w-full flex-nowrap items-center gap-3 overflow-x-auto text-[11px] text-fg-subtle [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => (
        <li key={item.id} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <span
            aria-hidden
            className="inline-block h-0.5 w-4 shrink-0"
            style={
              item.dashed
                ? { backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 8px)` }
                : { background: item.color }
            }
          />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function RsiPanel({
  points,
  t0,
  t1,
  label,
  axisLabel,
  emptyLabel,
}: {
  points: readonly { t: number; p: number }[];
  t0: number;
  t1: number;
  label: string;
  axisLabel: string;
  emptyLabel: string;
}) {
  const plot = plotRsiLine(points, t0, t1);

  return (
    <div className="relative mt-3 h-[4.5rem] min-w-0" data-rsi="true">
      <p className="sr-only">{label}</p>
      {plot ? (
        <>
          <svg
            viewBox={`0 0 ${CHART_W} ${RSI_H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={axisLabel}
            className="absolute inset-0 h-full w-full touch-pan-y"
          >
            {RSI_LEVELS.map((level) => {
              const y = yForRsi(level);
              return (
                <line
                  key={level}
                  x1={0}
                  x2={CHART_W}
                  y1={y}
                  y2={y}
                  stroke={RSI_GUIDE}
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            <path
              d={plot.line}
              fill="none"
              stroke={RSI_COLOR}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {RSI_LEVELS.map((level) => (
            <span
              key={level}
              aria-hidden
              className="num pointer-events-none absolute right-0 -translate-y-1/2 text-[10px] leading-none text-fg-subtle"
              style={{ top: `${(yForRsi(level) / RSI_H) * 100}%` }}
            >
              {level}
            </span>
          ))}
        </>
      ) : (
        <p className="flex h-full items-center text-xs text-fg-muted">{emptyLabel}</p>
      )}
    </div>
  );
}

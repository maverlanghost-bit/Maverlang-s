"use client";

import { Tooltip } from "@/components/ui/tooltip";
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
const RSI_GUIDE = "#d4d4d4";
const RSI_LEVELS = [30, 70] as const;

function StudyToggle({
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
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap outline-none transition duration-[140ms] ease-spring focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]",
        pressed ? "border-fg bg-fg text-bg" : "border-border/70 bg-surface-1/80 text-fg-muted hover:text-fg",
      )}
    >
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", pressed ? "ring-1 ring-white" : "ring-1 ring-border")}
        style={{ background: color }}
      />
      {label}
    </button>
  );
}

function StudyHelp({ label, topic, text }: { label: string; topic: string; text: string }) {
  return (
    <Tooltip content={<span className="block text-pretty">{text}</span>}>
      <button
        type="button"
        aria-label={`${label}: ${topic}`}
        className="inline-flex min-h-11 shrink-0 items-center rounded-full px-2.5 text-[13px] font-medium whitespace-nowrap text-fg-muted underline decoration-border-strong underline-offset-2 outline-none hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
      >
        {label}
      </button>
    </Tooltip>
  );
}

export function ChartStudyBar({
  copy,
  spy,
  smas,
  rsi,
}: {
  copy: GraficoCopy;
  spy: { on: boolean; onToggle: () => void } | null;
  smas: readonly { period: SmaPeriod; on: boolean; onToggle: () => void }[];
  rsi: { on: boolean; onToggle: () => void } | null;
}) {
  if (!spy && smas.length === 0 && !rsi) return null;
  const smaLabel: Record<SmaPeriod, string> = {
    20: copy.sma20,
    50: copy.sma50,
    200: copy.sma200,
  };

  return (
    <div className="mb-3 flex min-w-0 max-w-full flex-col gap-2">
      <div role="group" aria-label={copy.tools} className="flex max-w-full flex-wrap items-center gap-1.5">
        {spy ? (
          <>
            <StudyToggle pressed={spy.on} onClick={spy.onToggle} label={copy.vsSpy} color={BENCHMARK_COLOR} />
            <StudyHelp label={copy.help} topic={copy.spyLegend} text={copy.spyHelp} />
          </>
        ) : null}
        {smas.map((item) => (
          <StudyToggle
            key={item.period}
            pressed={item.on}
            onClick={item.onToggle}
            label={smaLabel[item.period]}
            color={SMA_COLOR[item.period]}
          />
        ))}
        {smas.length > 0 ? <StudyHelp label={copy.help} topic={copy.smaTitle} text={copy.smaHelp} /> : null}
        {rsi ? (
          <>
            <StudyToggle pressed={rsi.on} onClick={rsi.onToggle} label={copy.rsi} color={RSI_COLOR} />
            <StudyHelp label={copy.help} topic={copy.rsi} text={copy.rsiHelp} />
          </>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-pretty text-fg-muted">{copy.disclaimer}</p>
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
    <ul aria-label={label} className="mt-2 flex max-w-full flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
      {items.map((item) => (
        <li key={item.id} className="inline-flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0.5 w-4 shrink-0"
            style={
              item.dashed
                ? { backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 8px)` }
                : { background: item.color }
            }
          />
          <span className="truncate">{item.label}</span>
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
    <div className="mt-3 min-w-0" data-rsi="true">
      <p className="text-xs font-medium text-fg-muted">{label}</p>
      {plot ? (
        <div className="relative mt-1 h-[4.5rem] w-full">
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
              className="num pointer-events-none absolute right-0 -translate-y-1/2 bg-white px-0.5 text-[10px] text-fg-muted"
              style={{ top: `${(yForRsi(level) / RSI_H) * 100}%` }}
            >
              {level}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-fg-muted">{emptyLabel}</p>
      )}
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { MoverCard, SpyChip } from "@/components/domain/market-today/mover-card";
import { TodaySkeleton } from "@/components/domain/market-today/skeleton";
import { sparklineSmoothPath } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Button } from "@/components/ui/button";
import { indexFromKey } from "@/components/ui/keys";
import { hoyCopy } from "@/content/i18n/extra-hoy";
import { ApiError } from "@/lib/api/client";
import { apiResultSchema } from "@/lib/api/contracts";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { useHistory } from "@/lib/hooks/queries";
import { useFavorites } from "@/lib/hooks/use-favorites";
import { useT } from "@/lib/hooks/use-t";
import {
  formatChileClock,
  todayBoardSchema,
  type MoverCard as MoverCardData,
  type TodayBoard,
} from "@/lib/market/movers";

const LISTS = ["gainers", "losers", "viewed"] as const;
type ListId = (typeof LISTS)[number];

type SpotlightRange = "1D" | "1W" | "1M" | "3M" | "1Y";

const SPOTLIGHT_RANGES: { id: SpotlightRange; labelEs: string; labelEn: string; periodEs: string; periodEn: string }[] = [
  { id: "1D", labelEs: "1D", labelEn: "1D", periodEs: "hoy", periodEn: "today" },
  { id: "1W", labelEs: "1S", labelEn: "1W", periodEs: "en 1 semana", periodEn: "past week" },
  { id: "1M", labelEs: "1M", labelEn: "1M", periodEs: "en 1 mes", periodEn: "past month" },
  { id: "3M", labelEs: "3M", labelEn: "3M", periodEs: "en 3 meses", periodEn: "past 3 months" },
  { id: "1Y", labelEs: "1A", labelEn: "1Y", periodEs: "en 1 año", periodEn: "past year" },
];

async function fetchTodayBoard(): Promise<TodayBoard> {
  let response: Response;
  try {
    response = await fetch("/api/market/movers", {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("UPSTREAM", "No pudimos conectar.");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("UPSTREAM", "La respuesta no es JSON.", response.status || 502);
  }
  const parsed = apiResultSchema(todayBoardSchema).safeParse(payload);
  if (!parsed.success || !parsed.data.ok) {
    if (parsed.success && !parsed.data.ok) {
      throw new ApiError(parsed.data.error.code, parsed.data.error.message, response.status, parsed.data.requestId);
    }
    throw new ApiError("UPSTREAM", "La respuesta no tiene el formato esperado.", response.status || 502);
  }
  return parsed.data.data;
}

const CLOCK_MS = 15_000;
let chileNow: number | null = null;

function subscribeChileClock(onStoreChange: () => void) {
  const id = window.setInterval(() => {
    chileNow = Date.now();
    onStoreChange();
  }, CLOCK_MS);
  return () => window.clearInterval(id);
}

/** La primera lectura fija la hora. El intervalo la mueve cada 15 s. */
function chileClockSnapshot(): number | null {
  chileNow ??= Date.now();
  return chileNow;
}

function chileClockServerSnapshot(): number | null {
  return null;
}

function ChileClock({ label, locale }: { label: string; locale: "es-CL" | "en" }) {
  const now = useSyncExternalStore(subscribeChileClock, chileClockSnapshot, chileClockServerSnapshot);
  if (now === null) {
    return <span className="inline-block h-5 w-40 rounded-md bg-surface-2" aria-hidden />;
  }
  const date = new Date(now);
  return (
    <p className="shrink-0 text-sm text-fg-muted tabular-nums">
      <time dateTime={date.toISOString()}>{formatChileClock(date, locale)}</time>
      <span aria-hidden> · </span>
      <span>{label}</span>
    </p>
  );
}

function cardLabel(template: string, card: MoverCardData): string {
  return template.replace("{name}", card.name);
}

function buildFeaturedPool(board: TodayBoard | undefined): MoverCardData[] {
  if (!board) return [];
  const merged = [...board.gainers, ...board.viewed, ...board.losers];
  const seen = new Set<string>();
  const all: MoverCardData[] = [];
  for (const item of merged) {
    if (seen.has(item.symbol)) continue;
    seen.add(item.symbol);
    all.push(item);
  }
  const withSpark = all.filter((item) => item.spark.length >= 2);
  const source = withSpark.length > 0 ? withSpark : all;
  return source.slice(0, 6);
}

export function MarketToday() {
  const { language } = useT();
  const router = useRouter();
  const copy = hoyCopy(language);
  const locale = language === "en" ? "en" : "es-CL";
  const titleId = useId();
  const tabsId = useId();
  const panelId = useId();
  const chartGradId = `spotlight-grad-${useId().replace(/:/g, "")}`;
  const { symbols: favorites, toggle: toggleFavorite } = useFavorites();

  const board = useQuery({
    queryKey: ["market-today"],
    queryFn: fetchTodayBoard,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const [picked, setPicked] = useState<ListId | null>(null);
  const list: ListId =
    picked ?? LISTS.find((id) => (board.data?.[id].length ?? 0) > 0) ?? "gainers";

  const [slideIndex, setSlideIndex] = useState(0);
  const [range, setRange] = useState<SpotlightRange>("1M");
  const touchStartX = useRef<number | null>(null);

  const featuredPool = useMemo(() => buildFeaturedPool(board.data), [board.data]);
  const safeSlideIndex = featuredPool.length > 0 ? slideIndex % featuredPool.length : 0;
  const activeCard = featuredPool[safeSlideIndex] ?? null;

  const historyQuery = useHistory(activeCard?.symbol ?? "", range);

  const chartValues = useMemo(() => {
    const pts = historyQuery.data?.points;
    if (pts && pts.length >= 2) {
      return pts.map((pt) => pt.p);
    }
    return activeCard?.spark ?? [];
  }, [activeCard, historyQuery.data]);

  const displayPct = useMemo(() => {
    if (!activeCard) return 0;
    const pts = historyQuery.data?.points;
    if (range !== "1D" && pts && pts.length >= 2) {
      const first = pts[0]?.p ?? 0;
      const last = pts[pts.length - 1]?.p ?? 0;
      if (first > 0) return ((last - first) / first) * 100;
    }
    return activeCard.changePct;
  }, [activeCard, historyQuery.data, range]);

  const chartShape = useMemo(() => sparklineSmoothPath(chartValues, 520, 124), [chartValues]);
  const isPositive = displayPct >= 0;
  const strokeColor = isPositive ? "#059669" : "#e11d48";

  const axisLabels = useMemo(() => {
    const absMax = Math.max(Math.abs(displayPct), 2);
    const topVal = isPositive ? Math.round(absMax * 1.15) : 0;
    const midVal = isPositive ? Math.round(absMax * 0.55) : -Math.round(absMax * 0.55);
    const botVal = isPositive ? 0 : -Math.round(absMax * 1.15);
    const fmt = (n: number) => `${n > 0 ? "+" : ""}${n}%`;
    return { top: fmt(topVal), mid: fmt(midVal), bot: fmt(botVal) };
  }, [displayPct, isPositive]);

  const options: { id: ListId; label: string }[] = [
    { id: "gainers", label: copy.gainers },
    { id: "losers", label: copy.losers },
    { id: "viewed", label: copy.viewed },
  ];
  const cards = board.data ? board.data[list] : [];

  function move(current: ListId, key: string) {
    const index = Math.max(0, options.findIndex((option) => option.id === current));
    const nextIndex = indexFromKey(key, index, options.length);
    if (nextIndex === null) return;
    const option = options[nextIndex];
    if (!option) return;
    setPicked(option.id);
    document.getElementById(`${tabsId}-${option.id}`)?.focus();
  }

  function stepSlide(delta: number) {
    if (featuredPool.length <= 1) return;
    setSlideIndex((prev) => (prev + delta + featuredPool.length) % featuredPool.length);
  }

  function cycleList() {
    const idx = LISTS.indexOf(list);
    const next = LISTS[(idx + 1) % LISTS.length] ?? "gainers";
    setPicked(next);
  }

  const activeRangeMeta = SPOTLIGHT_RANGES.find((item) => item.id === range) ?? SPOTLIGHT_RANGES[2]!;
  const isFollowed = activeCard ? (favorites ?? []).includes(activeCard.symbol) : false;

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-fg">
            {copy.title}
          </h2>
          {board.data?.spy ? (
            <SpyChip
              card={board.data.spy}
              name={copy.spy}
              label={`${cardLabel(copy.openStock, board.data.spy)}. ${copy.spy}. ${formatPercent(board.data.spy.changePct)}`}
            />
          ) : null}
        </div>
        <ChileClock label={copy.clock} locale={locale} />
      </div>

      {board.isPending ? <TodaySkeleton label={copy.loading} /> : null}

      {board.isError && !board.data ? (
        <div role="alert" className="flex min-h-[148px] flex-col items-start justify-center gap-3">
          <p className="text-sm text-fg">{copy.error}</p>
          <Button variant="secondary" size="lg" onClick={() => void board.refetch()}>
            {copy.retry}
          </Button>
        </div>
      ) : null}

      {board.data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch">
          {activeCard ? (
            <div
              className="flex flex-col justify-between rounded-3xl border border-border/80 bg-white p-4 shadow-[0_12px_36px_-16px_rgba(12,15,20,0.08)] sm:p-5 lg:col-span-8"
              onTouchStart={(event) => {
                touchStartX.current = event.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                const startX = touchStartX.current;
                touchStartX.current = null;
                if (startX === null) return;
                const endX = event.changedTouches[0]?.clientX ?? startX;
                const deltaX = endX - startX;
                if (deltaX < -40) stepSlide(1);
                else if (deltaX > 40) stepSlide(-1);
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  role="link"
                  tabIndex={0}
                  aria-label={`${cardLabel(copy.openStock, activeCard)}. ${activeCard.symbol}`}
                  onClick={() => router.push(`/app/accion/${encodeURIComponent(activeCard.symbol)}`)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    router.push(`/app/accion/${encodeURIComponent(activeCard.symbol)}`);
                  }}
                  className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-fg/20"
                >
                  <TickerLogo
                    symbol={activeCard.symbol}
                    name={activeCard.name}
                    logoUrl={activeCard.logoUrl}
                    size={40}
                    decorative
                    loading="eager"
                    sizes="40px"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold tracking-tight text-fg sm:text-[17px]">
                      {activeCard.name} ({activeCard.symbol})
                    </p>
                    <p className="truncate text-xs text-fg-muted">
                      {language === "en"
                        ? `Tokenized stock · Solana 24/7 · #${safeSlideIndex + 1} featured`
                        : `Acción tokenizada · Solana 24/7 · Destacada #${safeSlideIndex + 1}`}
                    </p>
                  </div>
                </div>

                <div className="inline-flex shrink-0 items-center rounded-full bg-surface-2/90 p-0.5">
                  {SPOTLIGHT_RANGES.map((item) => {
                    const active = item.id === range;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setRange(item.id)}
                        className={cn(
                          "cursor-pointer rounded-full px-2.5 py-1 text-[11px] transition-all",
                          active
                            ? "bg-white font-semibold text-fg shadow-2xs"
                            : "font-medium text-fg-muted hover:text-fg",
                        )}
                      >
                        {language === "en" ? item.labelEn : item.labelEs}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-2.5 flex items-baseline gap-2">
                <span
                  className={cn(
                    "num text-2xl font-bold tracking-tight tabular-nums sm:text-[28px]",
                    isPositive ? "text-up" : "text-down",
                  )}
                >
                  {formatPercent(displayPct)}
                </span>
                <span className="text-xs font-medium text-fg-muted">
                  {language === "en" ? activeRangeMeta.periodEn : activeRangeMeta.periodEs}
                </span>
              </div>

              <div className="relative my-2 h-[136px] w-full sm:h-[148px]">
                {chartShape ? (
                  <svg
                    viewBox="0 0 560 128"
                    className="h-full w-full overflow-visible"
                    aria-hidden
                  >
                    <defs>
                      <linearGradient id={chartGradId} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={strokeColor} stopOpacity="0.22" />
                        <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <line
                      x1="0"
                      y1="16"
                      x2="518"
                      y2="16"
                      stroke="currentColor"
                      className="text-border/70"
                      strokeDasharray="3 3"
                    />
                    <line
                      x1="0"
                      y1="64"
                      x2="518"
                      y2="64"
                      stroke="currentColor"
                      className="text-border/70"
                      strokeDasharray="3 3"
                    />
                    <line
                      x1="0"
                      y1="112"
                      x2="518"
                      y2="112"
                      stroke="currentColor"
                      className="text-border/70"
                      strokeDasharray="3 3"
                    />
                    <path d={chartShape.area} fill={`url(#${chartGradId})`} />
                    <path
                      d={chartShape.line}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle
                      cx={chartShape.lastX}
                      cy={chartShape.lastY}
                      r="4"
                      fill={strokeColor}
                      className="drop-shadow-xs"
                    />
                  </svg>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl bg-surface-1/60 text-xs text-fg-muted">
                    {copy.empty}
                  </div>
                )}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-1 right-0 flex flex-col justify-between py-1 text-right text-[10px] font-medium text-fg-muted tabular-nums"
                >
                  <span>{axisLabels.top}</span>
                  <span>{axisLabels.mid}</span>
                  <span>{axisLabels.bot}</span>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleFavorite(activeCard.symbol)}
                    className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-fg px-5 py-1.5 text-xs font-semibold text-bg shadow-xs transition hover:bg-fg/90 active:scale-[0.98]"
                  >
                    <span>{isFollowed ? "✓" : "+"}</span>
                    <span>
                      {isFollowed
                        ? language === "en"
                          ? "Following"
                          : "Siguiendo"
                        : language === "en"
                          ? "Follow"
                          : "Seguir"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/app/accion/${encodeURIComponent(activeCard.symbol)}`)}
                    className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-full border border-border bg-white px-4 py-1.5 text-xs font-semibold text-fg transition hover:bg-surface-2 active:scale-[0.98]"
                  >
                    {language === "en" ? "Open" : "Ver"}
                  </button>
                </div>

                {featuredPool.length > 1 ? (
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center gap-1.5">
                      {featuredPool.map((item, idx) => (
                        <button
                          key={item.symbol}
                          type="button"
                          aria-label={`${idx + 1}: ${item.name}`}
                          onClick={() => setSlideIndex(idx)}
                          className={cn(
                            "cursor-pointer rounded-full transition-all",
                            safeSlideIndex === idx
                              ? "h-1.5 w-5 bg-fg"
                              : "h-1.5 w-1.5 bg-border hover:bg-fg-muted",
                          )}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={language === "en" ? "Previous stock" : "Acción anterior"}
                        onClick={() => stepSlide(-1)}
                        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-border bg-white text-xs font-semibold text-fg transition hover:bg-surface-2 active:scale-[0.96]"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        aria-label={language === "en" ? "Next stock" : "Siguiente acción"}
                        onClick={() => stepSlide(1)}
                        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-border bg-white text-xs font-semibold text-fg transition hover:bg-surface-2 active:scale-[0.96]"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div
            className={cn(
              "flex flex-col justify-between rounded-3xl border border-border/80 bg-white p-4 shadow-[0_12px_36px_-16px_rgba(12,15,20,0.08)] sm:p-5",
              activeCard ? "lg:col-span-4" : "lg:col-span-12",
            )}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-bold tracking-tight text-fg">
                  {language === "en" ? "Top movers" : "Mejor rendimiento"}
                </span>
                <span className="text-xs font-medium text-fg-muted">
                  {language === "en" ? "Ranking →" : "Ranking →"}
                </span>
              </div>

              <div
                role="tablist"
                aria-label={copy.lists}
                aria-orientation="horizontal"
                className="mt-2.5 grid grid-cols-3 gap-1 rounded-full bg-surface-2/85 p-1"
                onKeyDown={(event) => {
                  if (indexFromKey(event.key, 0, options.length) === null) return;
                  event.preventDefault();
                  move(list, event.key);
                }}
              >
                {options.map((option) => {
                  const selected = option.id === list;
                  return (
                    <button
                      key={option.id}
                      id={`${tabsId}-${option.id}`}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls={panelId}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setPicked(option.id)}
                      className={cn(
                        "inline-flex min-h-8 cursor-pointer items-center justify-center rounded-full px-2 text-xs font-semibold whitespace-nowrap outline-none transition-all focus-visible:ring-4 focus-visible:ring-fg/20",
                        selected
                          ? "bg-fg text-bg shadow-2xs"
                          : "text-fg-muted hover:text-fg",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div id={panelId} role="tabpanel" aria-labelledby={`${tabsId}-${list}`} className="mt-2 min-h-[180px] min-w-0">
                {cards.length === 0 ? (
                  <p className="flex min-h-[180px] items-center justify-center text-sm text-fg-muted">
                    {copy.empty}
                  </p>
                ) : (
                  <ol className="flex flex-col divide-y divide-border/50">
                    {cards.map((card, index) => (
                      <li key={card.symbol}>
                        <MoverCard
                          card={card}
                          rank={index + 1}
                          label={`${cardLabel(copy.openStock, card)}. ${card.symbol}. ${formatPercent(card.changePct)}`}
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={cycleList}
              className="mt-3 w-full cursor-pointer rounded-full bg-surface-2/80 py-2 text-center text-xs font-semibold text-fg transition hover:bg-surface-3"
            >
              {language === "en" ? "Switch ranking view" : "Cambiar vista del ranking"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useId, useState, useSyncExternalStore } from "react";

import { MoverCard, SpyChip } from "@/components/domain/market-today/mover-card";
import { TodaySkeleton } from "@/components/domain/market-today/skeleton";
import { Button } from "@/components/ui/button";
import { indexFromKey } from "@/components/ui/keys";
import { hoyCopy } from "@/content/i18n/extra-hoy";
import { ApiError } from "@/lib/api/client";
import { apiResultSchema } from "@/lib/api/contracts";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";
import { formatPercent } from "@/lib/format";
import {
  formatChileClock,
  todayBoardSchema,
  type MoverCard as MoverCardData,
  type TodayBoard,
} from "@/lib/market/movers";

const LISTS = ["gainers", "losers", "viewed"] as const;
type ListId = (typeof LISTS)[number];

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

export function MarketToday() {
  const { language } = useT();
  const copy = hoyCopy(language);
  const locale = language === "en" ? "en" : "es-CL";
  const titleId = useId();
  const tabsId = useId();
  const panelId = useId();
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

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={titleId} className="text-lg font-semibold tracking-tight text-fg">
          {copy.title}
        </h2>
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
        <div className="flex min-w-0 flex-col gap-3">
          {board.data.spy ? (
            <SpyChip
              card={board.data.spy}
              name={copy.spy}
              label={`${cardLabel(copy.openStock, board.data.spy)}. ${copy.spy}. ${formatPercent(board.data.spy.changePct)}`}
            />
          ) : null}

          <div
            role="tablist"
            aria-label={copy.lists}
            aria-orientation="horizontal"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
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
                    "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-3 text-[13px] font-medium whitespace-nowrap outline-none focus-visible:ring-4 focus-visible:ring-fg/20",
                    selected ? "bg-fg text-bg shadow-xs" : "bg-surface-1/80 text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div id={panelId} role="tabpanel" aria-labelledby={`${tabsId}-${list}`} className="min-h-[148px] min-w-0">
            {cards.length === 0 ? (
              <p className="flex min-h-[148px] items-center text-sm text-fg-muted">{copy.empty}</p>
            ) : (
              <ul className="-mx-4 flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pt-1 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
                {cards.map((card) => (
                  <li key={card.symbol} className="snap-start">
                    <MoverCard
                      card={card}
                      label={`${cardLabel(copy.openStock, card)}. ${card.symbol}. ${formatPercent(card.changePct)}`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

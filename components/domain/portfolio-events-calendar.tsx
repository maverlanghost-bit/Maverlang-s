"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { useFavorites } from "@/lib/hooks/use-favorites";
import { useT } from "@/lib/hooks/use-t";
import {
  getUpcomingEvents,
  type EventsCalendarScope,
  type MarketEvent,
  type MarketEventType,
} from "@/lib/market/events-calendar";

const SCOPE_OPTIONS: readonly { value: EventsCalendarScope; labelEs: string; labelEn: string }[] = [
  { value: "portfolio", labelEs: "Mi cartera", labelEn: "My portfolio" },
  { value: "favorites", labelEs: "Favoritas", labelEn: "Favorites" },
  { value: "all", labelEs: "Todo el mercado", labelEn: "All market" },
];

const TYPE_META: Record<MarketEventType, { tone: BadgeTone; labelEs: string; labelEn: string }> = {
  earnings: { tone: "brand", labelEs: "Resultados", labelEn: "Earnings" },
  dividend_multiplier: { tone: "up", labelEs: "Dividendo / Multiplicador", labelEn: "Dividend / Multiplier" },
  macro: { tone: "warn", labelEs: "Macro", labelEn: "Macro" },
};

function formatEventDate(isoDate: string, isEn: boolean): string {
  const [yearStr, monthStr, dayStr] = isoDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return isoDate;
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(isEn ? "en-US" : "es-CL", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function EventRow({ event, isEn }: { event: MarketEvent; isEn: boolean }) {
  const meta = TYPE_META[event.type];
  const dateLabel = formatEventDate(event.date, isEn);
  const title = isEn ? event.titleEn : event.titleEs;
  const detail = isEn ? event.detailEn : event.detailEs;

  return (
    <li className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral" className="font-mono">
            {dateLabel}
          </Badge>
          <Badge tone={meta.tone}>{isEn ? meta.labelEn : meta.labelEs}</Badge>
          {event.symbol ? (
            <Link
              href={`/app/accion/${encodeURIComponent(event.symbol)}`}
              className="text-sm font-medium text-fg underline-offset-4 hover:underline"
            >
              {event.symbol} · {event.name}
            </Link>
          ) : (
            <span className="text-sm font-medium text-fg">{event.name}</span>
          )}
        </div>
        <p className="text-[13px] font-medium text-fg-body">{title}</p>
        <p className="text-xs leading-relaxed text-fg-muted">{detail}</p>
      </div>

      {event.symbol ? (
        <Link
          href={`/app/accion/${encodeURIComponent(event.symbol)}`}
          className="inline-flex shrink-0 items-center self-start rounded-full border border-border px-3 py-1 text-xs font-medium text-fg transition-colors hover:bg-surface-2 sm:self-center"
        >
          {isEn ? "View stock" : "Ver acción"}
        </Link>
      ) : null}
    </li>
  );
}

/**
 * Calendario de próximos eventos corporativos (resultados, ajustes de
 * multiplicador por dividendo en xStocks) y hitos macro (FOMC, IPC EE.UU.).
 */
export function PortfolioEventsCalendar({ heldSymbols = [] }: { heldSymbols?: readonly string[] }) {
  const { language } = useT();
  const isEn = language === "en";
  const { symbols: favoriteSymbols } = useFavorites();

  const [scope, setScope] = useState<EventsCalendarScope>(() => (heldSymbols.length > 0 ? "portfolio" : "all"));

  const events = useMemo(
    () =>
      getUpcomingEvents({
        symbols: heldSymbols,
        favorites: favoriteSymbols ?? [],
        scope,
        limit: 10,
      }),
    [heldSymbols, favoriteSymbols, scope],
  );

  return (
    <section className="border-t border-border pt-8" aria-labelledby="portfolio-events-heading">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-prose">
          <h2 id="portfolio-events-heading" className="text-lg font-medium tracking-tight text-balance text-fg">
            {isEn ? "Events & earnings calendar" : "Calendario de eventos y resultados"}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
            {isEn
              ? "Upcoming quarterly earnings, xStocks dividend multiplier windows, and US macro dates."
              : "Próximos resultados trimestrales, ventanas de multiplicador por dividendo en xStocks e hitos macro de EE.UU."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={isEn ? "Filter events" : "Filtrar eventos"}>
          {SCOPE_OPTIONS.map((option) => {
            const active = scope === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setScope(option.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "bg-fg text-bg"
                    : "border border-border bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {isEn ? option.labelEn : option.labelEs}
              </button>
            );
          })}
        </div>
      </div>

      {events.length === 0 ? (
        <p className="mt-4 rounded-xl border border-border bg-surface-2/50 px-4 py-5 text-sm text-fg-muted">
          {isEn
            ? "No upcoming events found for this filter. Try switching to All market."
            : "No hay eventos próximos para este filtro. Prueba cambiando a Todo el mercado."}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border border-t border-border">
          {events.map((event) => (
            <EventRow key={event.id} event={event} isEn={isEn} />
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-fg-muted">
        {isEn
          ? "Dates are referential and estimated; they may change upon official issuer or central bank confirmation."
          : "Fechas referenciales y estimadas; pueden variar según confirmación oficial de cada emisor o entidad."}
      </p>
    </section>
  );
}

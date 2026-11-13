/**
 * Widgets de la tanda 2: resumen del día.
 *
 * Lo arma el servidor con los movimientos reales del catálogo y, si hay
 * sesión, con el total y la variación de la cartera. Aquí sólo se muestra:
 * ningún dato se calcula ni se inventa; si falta, dice "sin dato".
 * El texto de cierre recuerda que es información, no una recomendación.
 */

import Link from "next/link";

import { detailHref, finiteOrNull } from "@/components/ai/model";
import { ChangeBadge } from "@/components/domain/change-badge";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { formatDateTime, formatUsd } from "@/lib/format";
import type { AiWidget } from "@/components/ai/contract";

/** Texto único para cualquier valor que el servidor no pudo completar. */
const SIN_DATO = "sin dato";

const CARD_CLASS =
  "min-w-0 rounded-2xl border border-border/85 bg-bg-elevated/95 p-4 shadow-[0_10px_30px_-14px_rgba(12,15,20,0.1)] backdrop-blur-md transition-all duration-200 hover:border-brand/35 hover:shadow-[0_14px_34px_-14px_rgba(12,15,20,0.14)]";

type DailySummary = Extract<AiWidget, { type: "daily-summary" }>;
type DailyMovement = DailySummary["gainers"][number];

/** ISO con hora: la zona va explícita (`Z` o `±hh:mm`); sin ella no hay instante seguro. */
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;
const dayFormatter = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "UTC" });

/** Fecha de calendario sin correr el día por la zona horaria. */
function dayLabel(text: string): string | null {
  const parts = text.split("-").map(Number);
  const [year, month, date] = parts;
  if (parts.length !== 3 || !year || !month || !date) return null;
  return dayFormatter.format(new Date(Date.UTC(year, month - 1, date)));
}

/** `asOf` puede ser fecha suelta o ISO con hora; si no se entiende, se muestra tal cual. */
function asOfLabel(value: string | null): string {
  const text = (value ?? "").trim();
  if (!text) return SIN_DATO;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return dayLabel(text) ?? text;
  if (HAS_ZONE.test(text) && !Number.isNaN(Date.parse(text))) return formatDateTime(text);
  const day = text.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return dayLabel(day) ?? text;
  return text;
}

function nameOrTicker(item: DailyMovement): string {
  const name = item.name.trim();
  return name || item.ticker;
}

function MovementRow({ item }: { item: DailyMovement }) {
  const change = finiteOrNull(item.changePct);
  const href = detailHref(item.ticker);
  const name = nameOrTicker(item);

  return (
    <li className="flex min-h-11 items-center gap-2 border-b border-border/70 last:border-b-0">
      <TickerLogo
        symbol={item.ticker}
        name={name}
        logoUrl={logoPathFromSymbol(item.ticker)}
        size={32}
        loading="lazy"
        sizes="32px"
      />
      <span className="min-w-0 flex-1">
        {href ? (
          <Link
            href={href}
            className="block truncate rounded-sm font-medium text-fg outline-none transition-colors hover:text-brand focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            {name}
          </Link>
        ) : (
          <span className="block truncate font-medium text-fg">{name}</span>
        )}
        <span className="block truncate text-sm text-fg-muted">{item.ticker}</span>
      </span>
      {change == null ? (
        <span className="shrink-0 text-sm tabular-nums text-fg-muted">{SIN_DATO}</span>
      ) : (
        <ChangeBadge value={change} className="shrink-0 tabular-nums" />
      )}
    </li>
  );
}

function MovementList({
  title,
  items,
  empty,
}: {
  title: string;
  items: readonly DailyMovement[];
  empty: string;
}) {
  return (
    <section aria-label={title}>
      <h3 className="label">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-fg-muted">{empty}</p>
      ) : (
        <ul className="mt-1 border-t border-border/70">
          {items.map((item, index) => (
            <MovementRow key={`${item.ticker}-${index}`} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function DailySummaryWidget({ widget }: { widget: DailySummary }) {
  const gainers = widget.gainers ?? [];
  const losers = widget.losers ?? [];
  const portfolio = widget.portfolio;
  const total = portfolio ? finiteOrNull(portfolio.totalUsd) : null;
  const portfolioChange = portfolio ? finiteOrNull(portfolio.changePct) : null;
  const hasAsOf = (widget.asOf ?? "").trim().length > 0;

  return (
    <article data-ai-widget="daily-summary" className={CARD_CLASS}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold tracking-tight text-fg">Resumen del día</h2>
        <p className="text-xs text-fg-muted">
          {hasAsOf ? (
            <>
              Datos al <span className="text-fg-body">{asOfLabel(widget.asOf)}</span>
            </>
          ) : (
            "Sin fecha de corte"
          )}
        </p>
      </div>

      {portfolio ? (
        <div className="mt-3 rounded-xl border border-border/70 bg-surface-1 px-3 py-2">
          <p className="label">Tu cartera</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="num text-xl font-semibold tracking-tight tabular-nums text-fg">
              {total == null ? SIN_DATO : formatUsd(total)}
            </p>
            {portfolioChange == null ? (
              <span className="text-sm tabular-nums text-fg-muted">{SIN_DATO}</span>
            ) : (
              <ChangeBadge value={portfolioChange} className="tabular-nums" />
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-3">
        <MovementList title="Las que más suben" items={gainers} empty="Sin movimientos al alza registrados." />
        <MovementList title="Las que más bajan" items={losers} empty="Sin movimientos a la baja registrados." />
      </div>

      <p className="mt-3 rounded-xl border border-border/70 bg-surface-1 px-3 py-2 text-xs leading-relaxed text-fg-body">
        Resumen informativo, no es una recomendación.
      </p>
    </article>
  );
}

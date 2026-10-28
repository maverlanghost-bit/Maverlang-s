"use client";

import { useEffect, useId, useState } from "react";

import { Card } from "@/components/ui/card";
import { empresaCopy, type EmpresaCopy } from "@/content/i18n/extra-empresa";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";
import {
  formatIsoDate,
  formatMultiple,
  formatUsdAmount,
  formatUsdCompact,
  formatYield,
  latestFiling,
  readCompanyFactsView,
  type CompanyFactsView,
  type FactLocale,
} from "@/lib/market/fundamentals";

/**
 * Ficha "Datos de la empresa". Sin fila en la API no se muestra.
 * Montar en el detalle, después de KeyStats:
 * `<CompanyCard symbol={ticker.symbol} />` en
 * `app/(platform)/app/accion/[ticker]/detail-screen.tsx`.
 */
export function CompanyCard({ symbol }: { symbol: string }) {
  const { language } = useT();
  const copy = language === "en" ? empresaCopy.en : empresaCopy.esCL;
  const locale: FactLocale = language === "en" ? "en" : "es-CL";
  const titleId = useId();
  const [view, setView] = useState<CompanyFactsView | null>(null);

  useEffect(() => {
    const wanted = symbol.trim();
    if (!wanted) return;
    const controller = new AbortController();
    let active = true;
    setView(null);
    void (async () => {
      try {
        const response = await fetch(`/api/tickers/${encodeURIComponent(wanted)}/company`, {
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body: unknown = await response.json();
        const data =
          body && typeof body === "object" && "data" in body ? (body as { data?: unknown }).data : null;
        const parsed = readCompanyFactsView(data);
        if (active) setView(parsed);
      } catch {
        if (active) setView(null);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [symbol]);

  if (!view) return null;

  const rows = factRows(view, copy, locale);

  return (
    <Card>
      <section aria-labelledby={titleId}>
        <h2 id={titleId} className="text-lg font-semibold tracking-tight text-fg">
          {copy.title}
        </h2>
        {view.name ? <p className="mt-1 break-words text-sm text-fg-muted">{view.name}</p> : null}
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <Fact key={row.id} label={row.label} value={row.value} missing={row.missing} detail={row.detail} about={row.about} what={copy.what} />
          ))}
        </dl>
        <p className="mt-4 text-sm text-fg-muted">
          {copy.sourceLabel}:{" "}
          {view.sourceUrl ? (
            <a
              href={view.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-fg underline underline-offset-2"
            >
              {copy.sourceName}
              <span className="sr-only"> ({copy.sourceExternal})</span>
            </a>
          ) : (
            <span className="text-fg">{copy.sourceName}</span>
          )}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">{copy.disclaimer}</p>
      </section>
    </Card>
  );
}

function Fact({
  label,
  value,
  missing,
  detail,
  about,
  what,
}: {
  label: string;
  value: string;
  missing: boolean;
  detail: string | null;
  about: string;
  what: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="min-w-0 rounded-2xl border border-border/70 bg-surface-1/50 px-3.5 py-3 sm:px-4">
      <dt className="label max-w-full break-words">{label}</dt>
      <dd className="mt-1">
        <p className={cn("break-words text-base", missing ? "text-fg-muted" : "num text-fg")}>{value}</p>
        {detail ? <p className="mt-1 text-xs leading-relaxed text-fg-muted">{detail}</p> : null}
        <button
          type="button"
          className="mt-1 inline-flex min-h-11 items-center rounded-full px-1 text-sm text-fg-muted underline-offset-2 hover:text-fg hover:underline focus-visible:ring-4 focus-visible:ring-fg/20"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
        >
          {what}
        </button>
        {open ? (
          <p id={panelId} className="pb-2 text-sm leading-relaxed text-pretty text-fg-body">
            {about}
          </p>
        ) : null}
      </dd>
    </div>
  );
}

interface FactRowModel {
  id: string;
  label: string;
  value: string;
  missing: boolean;
  detail: string | null;
  about: string;
}

function factRows(view: CompanyFactsView, copy: EmpresaCopy, locale: FactLocale): FactRowModel[] {
  const sector = view.sector ?? (view.sic ? fill(copy.dates.sic, { code: view.sic }) : null);
  const cap = view.marketCapUsd === null ? null : formatUsdCompact(view.marketCapUsd, locale);
  const pe = view.pe === null ? null : formatMultiple(view.pe, locale);
  const eps = view.epsTtm === null ? null : formatUsdAmount(view.epsTtm, locale);
  const revenue = view.revenueTtm === null ? null : formatUsdCompact(view.revenueTtm, locale);
  const income = view.netIncomeTtm === null ? null : formatUsdCompact(view.netIncomeTtm, locale);
  const dividend = dividendText(view, locale);
  const filing = filingText(view, copy, locale);
  const filed = filedDetail(view, copy, locale);

  return [
    {
      id: "sector",
      label: copy.fields.sector.label,
      value: sector ?? copy.empty,
      missing: sector === null,
      detail: view.sector && view.sic ? fill(copy.dates.sic, { code: view.sic }) : null,
      about: copy.fields.sector.about,
    },
    {
      id: "marketCap",
      label: copy.fields.marketCap.label,
      value: cap ?? copy.empty,
      missing: cap === null,
      detail: joinDetails([
        dated(copy.dates.close, view.lastCloseDate, locale),
        dated(copy.dates.shares, view.sharesAsOf, locale),
      ]),
      about: copy.fields.marketCap.about,
    },
    {
      id: "pe",
      label: copy.fields.pe.label,
      value: pe ?? copy.empty,
      missing: pe === null,
      detail: joinDetails([
        dated(copy.dates.close, view.lastCloseDate, locale),
        dated(copy.dates.eps, view.epsPeriodEnd, locale),
      ]),
      about: copy.fields.pe.about,
    },
    {
      id: "eps",
      label: copy.fields.eps.label,
      value: eps ?? copy.empty,
      missing: eps === null,
      detail: dated(copy.dates.eps, view.epsPeriodEnd, locale),
      about: copy.fields.eps.about,
    },
    {
      id: "revenue",
      label: copy.fields.revenue.label,
      value: revenue ?? copy.empty,
      missing: revenue === null,
      detail: filed,
      about: copy.fields.revenue.about,
    },
    {
      id: "netIncome",
      label: copy.fields.netIncome.label,
      value: income ?? copy.empty,
      missing: income === null,
      detail: filed,
      about: copy.fields.netIncome.about,
    },
    {
      id: "dividend",
      label: copy.fields.dividend.label,
      value: dividend ?? copy.empty,
      missing: dividend === null,
      detail: joinDetails([dated(copy.dates.close, view.lastCloseDate, locale), filed]),
      about: copy.fields.dividend.about,
    },
    {
      id: "filing",
      label: copy.fields.filing.label,
      value: filing ?? copy.empty,
      missing: filing === null,
      detail: null,
      about: copy.fields.filing.about,
    },
  ];
}

function dividendText(view: CompanyFactsView, locale: FactLocale): string | null {
  if (view.dividendsPerShareTtm === null) return null;
  const amount = formatUsdAmount(view.dividendsPerShareTtm, locale);
  if (!amount) return null;
  if (view.dividendYield === null) return amount;
  const yieldText = formatYield(view.dividendYield, locale);
  return yieldText ? `${amount} · ${yieldText}` : amount;
}

function filingText(view: CompanyFactsView, copy: EmpresaCopy, locale: FactLocale): string | null {
  const parts: string[] = [];
  const quarter = view.last10q ? formatIsoDate(view.last10q, locale) : null;
  const annual = view.last10k ? formatIsoDate(view.last10k, locale) : null;
  if (quarter) parts.push(fill(copy.dates.filing10q, { date: quarter }));
  if (annual) parts.push(fill(copy.dates.filing10k, { date: annual }));
  return parts.length > 0 ? parts.join(" · ") : null;
}

function filedDetail(view: CompanyFactsView, copy: EmpresaCopy, locale: FactLocale): string | null {
  const filing = latestFiling(view);
  if (!filing) return null;
  const date = formatIsoDate(filing.date, locale);
  if (!date) return null;
  return `${filing.form} · ${fill(copy.dates.filed, { date })}`;
}

function dated(template: string, iso: string | null, locale: FactLocale): string | null {
  if (!iso) return null;
  const date = formatIsoDate(iso, locale);
  if (!date) return null;
  return fill(template, { date });
}

function joinDetails(parts: readonly (string | null)[]): string | null {
  const ready = parts.filter((part): part is string => part !== null && part !== "");
  return ready.length > 0 ? ready.join(" · ") : null;
}

function fill(template: string, values: Record<string, string>): string {
  let next = template;
  for (const [key, value] of Object.entries(values)) next = next.split(`{${key}}`).join(value);
  return next;
}

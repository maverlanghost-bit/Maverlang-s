"use client";

import { useEffect, useId, useState } from "react";

import { InfoTip } from "@/components/domain/info-tip";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

const CELL =
  "min-w-0 rounded-2xl border border-border/70 bg-surface-1/50 px-2 py-3 sm:px-4";

/**
 * Ficha "Datos de la empresa". 404 o sin fila: no se muestra.
 * Mientras carga, un esqueleto del mismo tamaño que la grilla.
 */
export function CompanyCard({ symbol }: { symbol: string }) {
  const { t, language } = useT();
  const copy = language === "en" ? empresaCopy.en : empresaCopy.esCL;
  const locale: FactLocale = language === "en" ? "en" : "es-CL";
  const titleId = useId();
  const wantedSymbol = symbol.trim();
  const [loaded, setLoaded] = useState<Load | null>(null);
  const ready = loaded !== null && loaded.symbol === wantedSymbol ? loaded : null;

  useEffect(() => {
    if (!wantedSymbol) return;
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/tickers/${encodeURIComponent(wantedSymbol)}/company`, {
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) {
          if (active) setLoaded({ symbol: wantedSymbol, status: "absent" });
          return;
        }
        const body: unknown = await response.json();
        const data =
          body && typeof body === "object" && "data" in body ? (body as { data?: unknown }).data : null;
        const parsed = readCompanyFactsView(data);
        if (!active) return;
        setLoaded(
          parsed
            ? { symbol: wantedSymbol, status: "ready", view: parsed }
            : { symbol: wantedSymbol, status: "absent" },
        );
      } catch {
        if (active) setLoaded({ symbol: wantedSymbol, status: "absent" });
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [wantedSymbol]);

  if (!wantedSymbol || ready?.status === "absent") return null;
  if (!ready) return <CompanySkeleton label={t.states.loading} />;

  const view = ready.view;
  const rows = factRows(view, copy, locale);
  const top = view.kind === "fund" ? view.fundTopHoldings : null;
  // Sin ninguna cifra que mostrar, la ficha no aparece (nunca celdas vacías).
  if (rows.length === 0 && !top) return null;
  const tip = view.kind === "fund" ? copy.fund.tip : view.kind === "foreign" ? copy.foreign.tip : copy.tip;
  const title = view.kind === "fund" ? copy.fund.title : copy.title;
  const dated = sourceDate(view, locale);

  return (
    <Card className="p-4 md:p-6">
      <section aria-labelledby={titleId}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-fg">
              {title}
            </h2>
            <p className="mt-0.5 min-h-4 truncate text-xs text-fg-muted">{view.name ?? ""}</p>
          </div>
          <InfoTip className="-mt-1.5 shrink-0" label={`${copy.what}. ${title}`} text={tip} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-1.5 sm:gap-2.5 md:grid-cols-3 xl:grid-cols-4">
          {rows.map((row) => (
            <div key={row.id} className={CELL}>
              <dt className="block max-w-full text-xs font-medium leading-4 tracking-tight whitespace-nowrap text-fg-muted">
                {row.label}
              </dt>
              <dd className="mt-1 min-w-0">
                <p className={cn("break-words text-sm", row.missing ? "text-fg-muted" : "num text-fg")}>{row.value}</p>
                {row.detail ? <p className="mt-1 text-[11px] leading-4 text-fg-muted">{row.detail}</p> : null}
              </dd>
            </div>
          ))}
        </dl>
        {top ? (
          <div className="mt-2.5 rounded-2xl border border-border/70 bg-surface-1/50 px-3 py-3 sm:px-4">
            <p className="text-xs font-medium leading-4 tracking-tight text-fg-muted">{copy.fund.top}</p>
            <ol className="mt-2 space-y-1.5">
              {top.map((holding) => (
                <li key={holding.name} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-fg">{holding.name}</span>
                  <span className="num shrink-0 text-fg-muted">{formatHoldingPct(holding.pct, locale)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        <p className="mt-3 text-[11px] leading-4 text-fg-muted">
          <span className="sr-only">{copy.sourceLabel}: </span>
          {view.sourceUrl ? (
            <a
              href={view.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-fg underline-offset-2 hover:underline"
            >
              {copy.sourceName}
              <span className="sr-only"> ({copy.sourceExternal})</span>
            </a>
          ) : (
            <span className="text-fg">{copy.sourceName}</span>
          )}
          {dated ? <span> · {fill(copy.asOf, { date: dated })}</span> : null}
        </p>
        <p className="mt-1 text-[11px] leading-4 text-fg-muted">{copy.disclaimer}</p>
      </section>
    </Card>
  );
}

type Load = { symbol: string; status: "absent" } | { symbol: string; status: "ready"; view: CompanyFactsView };

function CompanySkeleton({ label }: { label: string }) {
  return (
    <Card className="p-4 md:p-6" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="mt-1 h-4 w-32" />
        </div>
        <Skeleton className="size-10 shrink-0 rounded-full" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-1.5 sm:gap-2.5 md:grid-cols-3 xl:grid-cols-4">
        {["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
          <div key={key} className={CELL}>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="mt-1 h-5 w-20" />
            <Skeleton className="mt-1 h-3 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-3 h-3 w-40" />
      <Skeleton className="mt-1 h-3 w-56" />
    </Card>
  );
}

interface FactRowModel {
  id: string;
  label: string;
  value: string;
  missing: boolean;
  detail: string | null;
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
  if (view.kind === "fund") return fundRows(view, copy, locale);
  const foreign = view.kind === "foreign";
  const converted =
    foreign && view.reportCurrency && view.reportCurrency !== "USD" ? copy.foreign.converted : null;
  const period = foreign ? dated(copy.foreign.period, view.epsPeriodEnd, locale) : null;
  const yearDetail = foreign ? joinDetails([period ?? filed, converted]) : filed;

  const rows: FactRowModel[] = [
    {
      id: "sector",
      label: copy.fields.sector.label,
      value: sector ?? copy.empty,
      missing: sector === null,
      detail: view.sector && view.sic ? fill(copy.dates.sic, { code: view.sic }) : null,
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
    },
    {
      id: "eps",
      label: copy.fields.eps.label,
      value: eps ?? copy.empty,
      missing: eps === null,
      detail: dated(copy.dates.eps, view.epsPeriodEnd, locale),
    },
    {
      id: "revenue",
      label: foreign ? copy.foreign.revenue : copy.fields.revenue.label,
      value: revenue ?? copy.empty,
      missing: revenue === null,
      detail: yearDetail,
    },
    {
      id: "netIncome",
      label: foreign ? copy.foreign.netIncome : copy.fields.netIncome.label,
      value: income ?? copy.empty,
      missing: income === null,
      detail: yearDetail,
    },
    {
      id: "dividend",
      label: copy.fields.dividend.label,
      value: dividend ?? copy.empty,
      missing: dividend === null,
      detail: joinDetails([dated(copy.dates.close, view.lastCloseDate, locale), filed]),
    },
    {
      id: "filing",
      label: copy.fields.filing.label,
      value: filing ?? copy.empty,
      missing: filing === null,
      detail: null,
    },
  ];
  return rows.filter((row) => !row.missing);
}

function sourceDate(view: CompanyFactsView, locale: FactLocale): string | null {
  const filing = latestFiling(view);
  const raw = filing?.date ?? view.lastCloseDate ?? view.updatedAt;
  if (!raw) return null;
  return formatIsoDate(raw.slice(0, 10), locale);
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
  if (view.kind !== "company") {
    const latest = latestFiling(view);
    const date = latest ? formatIsoDate(latest.date, locale) : null;
    return latest && date ? `${latest.form} ${date}` : null;
  }
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

/** ETF: solo las celdas con dato. */
function fundRows(view: CompanyFactsView, copy: EmpresaCopy, locale: FactLocale): FactRowModel[] {
  const net = view.fundNetAssets === null ? null : formatUsdCompact(view.fundNetAssets, locale);
  const count = view.fundHoldingsCount === null ? null : new Intl.NumberFormat(locale).format(view.fundHoldingsCount);
  const report = latestFiling(view);
  const reportDate = report ? formatIsoDate(report.date, locale) : null;
  const rows: FactRowModel[] = [
    { id: "type", label: copy.fund.type, value: copy.fund.etf, missing: false, detail: view.fundFamily },
    {
      id: "netAssets",
      label: copy.fund.netAssets,
      value: net ?? "",
      missing: net === null,
      detail: dated(copy.fund.asOf, view.fundReportDate, locale),
    },
    { id: "holdings", label: copy.fund.holdings, value: count ?? "", missing: count === null, detail: null },
    { id: "report", label: copy.fund.report, value: reportDate ?? "", missing: reportDate === null, detail: null },
  ];
  return rows.filter((row) => !row.missing);
}

/** 7,12 → "7,12 %". */
function formatHoldingPct(pct: number, locale: FactLocale): string {
  return new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(
    pct / 100,
  );
}

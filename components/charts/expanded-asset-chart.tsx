"use client";

import { useCallback, useMemo, useState } from "react";
import { FinancialChart } from "@/components/charts/financial-chart";
import { ChartContext } from "@/components/charts/chart-context";
import { OverlayPanel } from "@/components/ui/overlay";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useHistory } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { chartPoints, pricePrecision } from "@/lib/charts/data";
import { comparisonSeries } from "@/lib/charts/comparison";
import { DETAIL_RANGES, rangeMove, toneOf } from "@/lib/market/series";
import { formatDateTime, formatPercent } from "@/lib/format";
import type { Range } from "@/lib/types";

/** Mounted only on explicit expansion; transcript previews keep their lightweight SVG. */
export function ExpandedAssetChart({ symbol, name, initialRange, onClose }: { symbol: string; name: string; initialRange: Range; onClose: () => void }) {
  const { t, language } = useT();
  const en = language === "en";
  const [range, setRange] = useState(initialRange);
  const [inspection, setInspection] = useState<{ price: number; time: number | null } | null>(null);
  const history = useHistory(symbol, range);
  const observations = useMemo(() => chartPoints(history.data?.points ?? []), [history.data?.points]);
  const points = useMemo(() => comparisonSeries([{ id: symbol, points: observations, source: history.data?.source }]).series[0]?.points ?? [], [symbol, observations, history.data?.source]);
  const move = rangeMove(points);
  const shownPrice = inspection?.price ?? observations[observations.length - 1]?.p;
  const inspectInChart = useCallback((price: number | null, time?: number | null) => {
    setInspection(price == null ? null : { price, time: time ?? null });
  }, []);
  const priceLabel = shownPrice == null ? "—" : new Intl.NumberFormat(language, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: pricePrecision(shownPrice) }).format(shownPrice);
  return <OverlayPanel open onClose={onClose} title={`${en ? "History" : "Historial"} · ${name}`} description={en ? "This view requests the selected history. Its data may differ from an earlier saved reply." : "Esta vista consulta el historial seleccionado. Sus datos pueden diferir de una respuesta guardada anteriormente."} frameClassName="flex items-center justify-center p-3 sm:p-6" panelClassName="flex max-h-[90dvh] w-full max-w-6xl flex-col rounded-xl border border-border bg-bg p-4 shadow-float sm:p-6 [&>h2]:shrink-0 [&>p]:shrink-0 [&>div]:min-h-0 [&>div]:overflow-y-auto">
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-xs text-fg-muted">{symbol} · USD</p><p className="num text-xl font-medium">{priceLabel}</p><p className="text-xs text-fg-muted">{inspection?.time ? formatDateTime(new Date(inspection.time).toISOString()) : en ? "Last observation in the selected history" : "Último registro del historial seleccionado"}</p></div><p className="num text-sm">{move === null ? "—" : formatPercent(move)} · {en ? "selected period" : "período seleccionado"}</p></div>
      <div className="flex flex-wrap items-center justify-between gap-2"><div role="group" aria-label={t.detail.rangesLabel} className="flex flex-wrap gap-1">{DETAIL_RANGES.map((value) => <button type="button" key={value} aria-pressed={range === value} onClick={() => { setRange(value); setInspection(null); }} className={`min-h-11 rounded-full px-3 text-sm outline-none focus-visible:ring-4 focus-visible:ring-fg/20 ${range === value ? "bg-fg text-bg" : "text-fg-muted hover:bg-surface-1"}`}>{t.detail.rangeShort[value]}</button>)}</div><button type="button" disabled={history.isFetching} onClick={() => { void history.refetch(); }} className="min-h-11 rounded-full border border-border px-3 text-xs outline-none hover:bg-surface-1 focus-visible:ring-4 focus-visible:ring-fg/20 disabled:opacity-60">{history.isFetching ? (en ? "Updating…" : "Actualizando…") : en ? "Update history" : "Actualizar historial"}</button></div>
      <ChartContext source={history.data?.source} metadata={history.data?.metadata} points={observations} currency="USD" range={range} />
      {history.isPending ? <div role="status" aria-label={t.states.loading}><Skeleton className="h-[55dvh] min-h-64 w-full" /></div> : history.isError && !history.data ? <ErrorState title={t.detail.chartError} retryLabel={t.states.retry} onRetry={() => { void history.refetch(); }} /> : <>
        {history.isError ? <p role="status" className="text-xs text-warn">{en ? "The history could not be refreshed. Previous observations are shown." : "No se pudo actualizar el historial. Se muestran los registros anteriores."}</p> : null}
        <FinancialChart datasetKey={`expanded:${symbol}:${range}`} points={points.length ? points : observations} tone={toneOf(move)} reference={history.data?.source !== "ticks"} currency="USD" label={`${symbol} · ${t.detail.rangeCaption[range]}`} emptyLabel={t.detail.chartEmpty} emptyHint={t.detail.chartEmptyHint} heightClassName="h-[55dvh] min-h-64" onHover={inspectInChart} onToggleFullscreen={onClose} isFullscreen showGrid />
      </>}
    </div>
  </OverlayPanel>;
}

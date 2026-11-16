"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AreaSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle,
  createChart, type DataItem, type IChartApi, type IPriceLine, type ISeriesApi, type MouseEventParams,
  type SeriesType, type Time, type UTCTimestamp,
} from "lightweight-charts";
import type { FinancialChartProps } from "./financial-chart";
import { TONE_STROKE } from "@/components/domain/svg-price-chart";
import { chartPoints, chartSegments, inChartWindow, observedSeries, pricePrecision, sharedWindow, type FinancialPoint } from "@/lib/charts/data";
import { useT } from "@/lib/hooks/use-t";

type Managed = { api: ISeriesApi<SeriesType>; kind: SeriesType; data: DataItem<Time>[] };
type Layer = { id: string; label: string; rows: readonly FinancialPoint[]; color: string; rebased?: boolean; dashed?: boolean };

function cssColor(value: string): string {
  const match = value.match(/^var\((--[^,)]+)(?:,\s*([^)]*))?\)$/);
  return match ? getComputedStyle(document.documentElement).getPropertyValue(match[1]!).trim() || match[2] || "#5b5e63" : value;
}

function transparent(color: string, alpha: number): string {
  const hex = color.replace("#", "");
  if (/^[a-f\d]{6}$/i.test(hex)) {
    return `rgba(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}, ${alpha})`;
  }
  const rgb = color.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
  return rgb ? `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})` : color;
}

/** Incremental tail updates preserve a user's viewport; corrections replace the dataset. */
function setRows(managed: Managed, next: DataItem<Time>[]) {
  const previous = managed.data;
  const tailOnly = previous.length > 0 && (next.length === previous.length || next.length === previous.length + 1)
    && previous.slice(0, -1).every((row, index) => JSON.stringify(row) === JSON.stringify(next[index]));
  if (tailOnly) {
    if (next.length > previous.length) managed.api.update(next[next.length - 2]!);
    managed.api.update(next[next.length - 1]!);
  } else {
    managed.api.setData(next);
  }
  managed.data = next;
}

export function FinancialChartCanvas(props: FinancialChartProps) {
  const { language } = useT();
  const en = language === "en";
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef(new Map<string, Managed>());
  const lines = useRef<IPriceLine[]>([]);
  const fitted = useRef<string | null>(null);
  const latest = useRef(props);
  const rowsRef = useRef<readonly FinancialPoint[]>([]);
  const [readings, setReadings] = useState<{ date: number; values: Array<{ id: string; label: string; text: string; color: string }> } | null>(null);
  const [explorer, setExplorer] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dataId = useId();
  const raw = useMemo(() => observedSeries(props.points, props.livePoint), [props.points, props.livePoint]);
  const comparative = Boolean(props.benchmark) || Boolean(props.overlays?.some((layer) => layer.rebased));
  const percent = comparative || props.axisMode === "percent";
  const fx = props.currency === "CLP" && props.rate && props.rate > 0 ? props.rate : 1;
  const currency = props.currency === "CLP" && props.rate && props.rate > 0 ? "CLP" : "USD";
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(language, { timeZone: "America/Santiago", dateStyle: "medium", timeStyle: "short" }), [language]);
  const tickFormat = useMemo(() => new Intl.DateTimeFormat(language, { timeZone: "America/Santiago", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), [language]);
  const numberFormat = useMemo(() => new Intl.NumberFormat(language, {
    style: "currency", currency, maximumFractionDigits: pricePrecision((raw[raw.length - 1]?.p ?? 1) * fx, currency),
  }), [language, currency, raw, fx]);
  const pctFormat = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 2, signDisplay: "exceptZero" }), [language]);
  const display = useCallback((value: number) => percent ? `${pctFormat.format(value)} %` : numberFormat.format(value), [percent, pctFormat, numberFormat]);
  const displayRef = useRef(display);
  const dateFormatRef = useRef(dateFormat);
  const layerLabels = useRef(new Map<string, { label: string; color: string; logicalId: string }>());
  const observationsByLayer = useRef(new Map<string, readonly FinancialPoint[]>());

  useEffect(() => { latest.current = props; displayRef.current = display; dateFormatRef.current = dateFormat; });

  useEffect(() => {
    if (!container.current) return;
    const rootStyle = getComputedStyle(document.documentElement);
    const background = rootStyle.getPropertyValue("--color-bg").trim() || "#ffffff";
    const instance = createChart(container.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: background }, textColor: "#5b5e63", fontFamily: "Geist, system-ui, sans-serif", fontSize: 11, attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 }, minimumWidth: 70 },
      timeScale: { borderVisible: false, rightOffset: 3, timeVisible: true, secondsVisible: false, fixLeftEdge: true },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "#848484", labelBackgroundColor: "#1f1f1f" }, horzLine: { color: "#848484", labelBackgroundColor: "#1f1f1f" } },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
      kineticScroll: { mouse: false, touch: true },
    });
    const managedSeries = series.current;
    chart.current = instance;
    const onCrosshair = (event: MouseEventParams<Time>) => {
      if (!event.point || typeof event.time !== "number") {
        latest.current.onHover(null);
        latest.current.onCrosshairTime?.(null);
        latest.current.onHighlightLayer?.(null);
        setReadings(null);
        return;
      }
      const main = rowsRef.current.find((row) => Math.floor(row.t / 1000) === event.time);
      latest.current.onHover(main && !main.gap ? main.p : null, main && !main.gap ? main.observedAt ?? main.t : null);
      latest.current.onCrosshairTime?.(event.time * 1000);
      let focused: string | null = null;
      const values: Array<{ id: string; label: string; text: string; color: string }> = [];
      for (const [id, managed] of series.current) {
        if (id === "volume") continue;
        const reading = event.seriesData.get(managed.api);
        const value = reading && ("value" in reading ? reading.value : "close" in reading ? reading.close : undefined);
        const meta = layerLabels.current.get(id);
        if (typeof value === "number" && meta) {
          const point = observationsByLayer.current.get(id)?.find((row) => Math.floor(row.t / 1000) === event.time);
          const observedAt = point?.observedAt;
          const observed = observedAt && Math.floor(observedAt / 1000) !== event.time ? ` · ${dateFormatRef.current.format(observedAt)}` : "";
          values.push({ id, ...meta, text: `${displayRef.current(value)}${observed}` });
        }
        if (event.hoveredInfo?.series === managed.api) focused = meta?.logicalId ?? id;
      }
      latest.current.onHighlightLayer?.(focused);
      setReadings({ date: event.time * 1000, values });
    };
    instance.subscribeCrosshairMove(onCrosshair);
    return () => {
      instance.unsubscribeCrosshairMove(onCrosshair);
      instance.remove();
      chart.current = null;
      managedSeries.clear();
      lines.current = [];
      fitted.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    const layers: Layer[] = [{ id: "asset", label: props.label, rows: raw, color: cssColor(props.lineColor ?? (props.reference ? "#5b5e63" : TONE_STROKE[props.tone])), dashed: props.reference }];
    for (const overlay of props.overlays ?? []) layers.push({ ...overlay, rows: chartPoints(overlay.points), dashed: Boolean(overlay.dash) });
    if (props.benchmark) layers.push({ id: "benchmark", label: props.benchmark.label, rows: chartPoints(props.benchmark.points), color: "#1762b8", rebased: true, dashed: true });
    const comparisons = layers.filter((layer) => layer.rebased && layer.rows.length >= 2);
    const bounds = comparisons.length ? sharedWindow([raw, ...comparisons.map((layer) => layer.rows)]) : null;
    const baseRows = bounds ? inChartWindow(raw, bounds) : raw;
    const mainBase = baseRows[0]?.p ?? 0;
    rowsRef.current = baseRows;
    const renderedLayers = layers.flatMap((layer) => {
      const rows = bounds ? inChartWindow(layer.rows, bounds) : layer.rows;
      const base = layer.rebased ? rows[0]?.p ?? 0 : mainBase;
      const segments = chartSegments(rows);
      return segments.map((segment, index) => ({ ...layer, rows: segment, base, logicalId: layer.id, id: index === 0 ? layer.id : `${layer.id}:segment:${segment[0]!.t}`, last: index === segments.length - 1 }));
    });
    layerLabels.current = new Map(renderedLayers.map((layer) => [layer.id, { label: layer.label, color: cssColor(layer.color), logicalId: layer.logicalId }]));
    observationsByLayer.current = new Map(renderedLayers.map((layer) => [layer.id, layer.rows]));
    const expected = new Set(renderedLayers.map((layer) => layer.id));
    const validCandles = !percent && props.chartStyle === "candles" && baseRows.length > 1 && baseRows.every((row) => {
      const bar = row as FinancialPoint;
      return [bar.o, bar.h, bar.l, bar.c].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
        && bar.h! >= Math.max(bar.o!, bar.c!) && bar.l! <= Math.min(bar.o!, bar.c!);
    });
    for (const layer of renderedLayers) {
      const layerRows = layer.rows;
      const base = layer.base;
      const convert = (price: number) => percent ? (base > 0 ? (price / base - 1) * 100 : 0) : price * fx;
      const kind: SeriesType = layer.logicalId === "asset" ? validCandles ? "Candlestick" : percent || props.reference ? "Line" : "Area" : "Line";
      let managed = series.current.get(layer.id);
      if (managed?.kind !== kind) {
        if (managed) instance.removeSeries(managed.api);
        const api = kind === "Area" ? instance.addSeries(AreaSeries) : kind === "Candlestick" ? instance.addSeries(CandlestickSeries) : instance.addSeries(LineSeries);
        managed = { api: api as ISeriesApi<SeriesType>, kind, data: [] };
        series.current.set(layer.id, managed);
        if (layer.id === "asset") lines.current = [];
      }
      const color = cssColor(layer.color);
      managed.api.applyOptions({
        lineColor: color, color, topColor: transparent(color, 0.15), bottomColor: transparent(color, 0),
        upColor: "#0f7a32", downColor: "#c81e1e", borderVisible: false, wickUpColor: "#0f7a32", wickDownColor: "#c81e1e",
        lineWidth: layer.logicalId === "asset" ? 2 : 1, lineStyle: layer.dashed ? LineStyle.Dashed : LineStyle.Solid,
        lastValueVisible: layer.logicalId === "asset" && layer.last, priceLineVisible: layer.logicalId === "asset" && layer.last,
        priceFormat: { type: "custom", formatter: display, minMove: percent ? 0.01 : 10 ** -pricePrecision((layerRows[layerRows.length - 1]?.p ?? 1) * fx, currency) },
      });
      const data: DataItem<Time>[] = layerRows.map((row) => {
        const time = Math.floor(row.t / 1000) as UTCTimestamp;
        const bar = row as FinancialPoint;
        if (bar.gap) return { time };
        return kind === "Candlestick"
          ? { time, open: bar.o! * fx, high: bar.h! * fx, low: bar.l! * fx, close: bar.c! * fx }
          : { time, value: convert(row.p) };
      });
      setRows(managed, data);
    }
    const volumeRows = baseRows.filter((row) => typeof (row as FinancialPoint).v === "number" && Number.isFinite((row as FinancialPoint).v) && (row as FinancialPoint).v! >= 0);
    if (props.showVolume && volumeRows.length === baseRows.length && baseRows.length > 1) {
      expected.add("volume");
      let volume = series.current.get("volume");
      if (!volume) {
        volume = { api: instance.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, color: "#848484", priceLineVisible: false, lastValueVisible: false }, 1) as ISeriesApi<SeriesType>, kind: "Histogram", data: [] };
        series.current.set("volume", volume);
      }
      instance.panes()[1]?.setHeight(70);
      setRows(volume, volumeRows.map((row) => ({ time: Math.floor(row.t / 1000) as UTCTimestamp, value: (row as FinancialPoint).v! })));
    }
    for (const [id, managed] of series.current) if (!expected.has(id)) { instance.removeSeries(managed.api); series.current.delete(id); }
    const primary = series.current.get("asset");
    if (primary) {
      for (const line of lines.current) primary.api.removePriceLine(line);
      lines.current = [];
      if (!percent && baseRows.length > 1) {
        const low = Math.min(...baseRows.map((row) => row.p));
        const high = Math.max(...baseRows.map((row) => row.p));
        for (const [price, title, color] of [[props.avgCostUsd, en ? "Average cost" : "Costo medio", "#0f7a32"], [props.periodAvgUsd, en ? "Period average" : "Promedio", "#1762b8"]] as const) {
          if (typeof price === "number" && price >= low && price <= high) lines.current.push(primary.api.createPriceLine({ price: price * fx, title, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true }));
        }
      }
    }
    instance.applyOptions({
      grid: { vertLines: { visible: false }, horzLines: { visible: Boolean(props.showGrid), color: "#e6e6e6" } },
      localization: { locale: language, priceFormatter: display, timeFormatter: (time: Time) => typeof time === "number" ? dateFormat.format(time * 1000) : String(time) },
      timeScale: { tickMarkFormatter: (time: Time) => typeof time === "number" ? tickFormat.format(time * 1000) : null },
    });
    if (baseRows.length >= 2 && fitted.current !== props.datasetKey) { instance.timeScale().fitContent(); fitted.current = props.datasetKey; }
  }, [raw, props.datasetKey, props.label, props.lineColor, props.overlays, props.benchmark, props.reference, props.tone, props.chartStyle, props.showVolume, props.showGrid, props.avgCostUsd, props.periodAvgUsd, fx, currency, percent, language, en, dateFormat, tickFormat, display]);

  useEffect(() => {
    for (const [id, managed] of series.current) {
      const color = layerLabels.current.get(id)?.color;
      if (!color) continue;
      const ink = props.highlightedLayerId && props.highlightedLayerId !== layerLabels.current.get(id)?.logicalId ? transparent(color, 0.25) : color;
      managed.api.applyOptions({ color: ink, lineColor: ink, topColor: transparent(ink, 0.12), bottomColor: transparent(ink, 0) });
    }
  }, [props.highlightedLayerId]);

  const showPoint = (index: number) => {
    const row = rowsRef.current[index];
    if (!row) return;
    if (row.gap) { props.onHover(null); props.onCrosshairTime?.(null); return; }
    props.onHover(row.p, row.observedAt ?? row.t);
    props.onCrosshairTime?.(row.t);
    const value = percent ? (row.p / (rowsRef.current[0]?.p ?? row.p) - 1) * 100 : row.p * fx;
    const main = series.current.get("asset");
    if (main) chart.current?.setCrosshairPosition(value, Math.floor(row.t / 1000) as UTCTimestamp, main.api);
  };
  const valid = raw.length >= 2;
  const selectedPoint = raw[Math.min(selectedIndex, raw.length - 1)];
  const selectedDescription = selectedPoint ? selectedPoint.gap
    ? `${dateFormat.format(selectedPoint.t)} · ${en ? "No observation" : "Sin registro"}`
    : `${dateFormat.format(selectedPoint.observedAt ?? selectedPoint.t)} · ${numberFormat.format(selectedPoint.p * fx)}` : undefined;
  const carriedDates = raw.some((point) => point.observedAt !== undefined && point.observedAt !== point.t);
  const zoom = (factor: number) => {
    const scale = chart.current?.timeScale();
    const range = scale?.getVisibleLogicalRange();
    if (!scale || !range) return;
    const middle = (range.from + range.to) / 2;
    const half = Math.max(2, (range.to - range.from) * factor / 2);
    scale.setVisibleLogicalRange({ from: middle - half, to: middle + half });
  };
  return (
    <div className="absolute inset-0" data-chart-engine="lightweight-charts" aria-busy={props.quiet || undefined}>
      <div ref={container} className="absolute inset-0" aria-hidden="true" />
      {!valid && !props.quiet ? <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg px-5 text-center"><p className="text-sm text-fg-muted">{props.emptyLabel}</p>{props.emptyHint ? <p className="max-w-sm text-xs text-fg-subtle">{props.emptyHint}</p> : null}</div> : null}
      <div className="absolute top-1 right-1 flex gap-1 rounded-full bg-bg/95 p-0.5">
        <button type="button" onClick={() => zoom(0.75)} className="hidden min-h-8 min-w-8 items-center justify-center rounded-full text-sm text-fg-muted hover:bg-surface-1 sm:inline-flex" aria-label={en ? "Zoom in" : "Acercar gráfico"}>+</button>
        <button type="button" onClick={() => zoom(1.25)} className="hidden min-h-8 min-w-8 items-center justify-center rounded-full text-sm text-fg-muted hover:bg-surface-1 sm:inline-flex" aria-label={en ? "Zoom out" : "Alejar gráfico"}>−</button>
        <button type="button" onClick={() => chart.current?.timeScale().fitContent()} className="min-h-11 rounded-full px-2.5 text-xs text-fg-muted hover:bg-surface-1 sm:min-h-8" aria-label={en ? "Reset chart view" : "Restablecer vista del gráfico"}>↺</button>
        <button type="button" onClick={() => chart.current?.timeScale().scrollToRealTime()} className="min-h-11 rounded-full px-2.5 text-xs text-fg-muted hover:bg-surface-1 sm:min-h-8">{en ? "Latest" : "Último"}</button>
        {props.onToggleFullscreen ? <button type="button" onClick={props.onToggleFullscreen} className="min-h-11 rounded-full px-2.5 text-sm text-fg-muted hover:bg-surface-1 sm:min-h-8" aria-label={props.isFullscreen ? en ? "Exit full screen" : "Salir de pantalla completa" : en ? "Full screen" : "Pantalla completa"}>⛶</button> : null}
      </div>
      {readings && valid ? <div className="pointer-events-none absolute top-1 left-1 max-w-[min(70%,24rem)] rounded-md border border-border bg-bg/95 p-2 text-[11px] leading-5 shadow-card" aria-hidden="true"><p className="text-fg-muted">{dateFormat.format(readings.date)}</p>{readings.values.map((item) => <p key={item.id} className="flex justify-between gap-3"><span className="truncate" style={{ color: item.color }}>{item.label}</span><span className="num shrink-0 text-fg">{item.text}</span></p>)}</div> : null}
      <div className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:inset-x-2 focus-within:top-12 focus-within:z-10 focus-within:rounded-md focus-within:bg-bg focus-within:p-3">
        <label className="text-xs">{props.label}<input type="range" min={0} max={Math.max(0, raw.length - 1)} value={Math.min(selectedIndex, Math.max(0, raw.length - 1))} aria-label={props.label} aria-valuetext={selectedDescription} disabled={!valid} onChange={(event) => { const index = Number(event.target.value); setSelectedIndex(index); showPoint(index); }} onBlur={() => { props.onHover(null); props.onCrosshairTime?.(null); chart.current?.clearCrosshairPosition(); }} className="mt-2 block w-full" /></label>
        <button type="button" aria-controls={dataId} aria-expanded={explorer} onClick={() => setExplorer((value) => !value)} className="mt-2 min-h-11 text-xs underline">{en ? "View data table" : "Ver tabla de datos"}</button>
      </div>
      {explorer ? <div id={dataId} className="absolute inset-0 z-20 overflow-auto rounded-md border border-border bg-bg p-4"><button type="button" onClick={() => setExplorer(false)} className="sticky top-0 min-h-11 bg-bg text-sm underline">{en ? "Close data table" : "Cerrar tabla de datos"}</button><table className="w-full text-left text-xs"><caption className="py-2 text-left">{props.label} · {currency}</caption><thead><tr><th scope="col">{en ? "Date" : "Fecha"}</th><th scope="col">{en ? "Price" : "Precio"}</th>{carriedDates ? <th scope="col">{en ? "Observed at" : "Fecha del registro"}</th> : null}</tr></thead><tbody>{raw.map((row) => <tr key={row.t}><td className="py-2">{dateFormat.format(row.t)}</td><td className="num">{row.gap ? "—" : numberFormat.format(row.p * fx)}</td>{carriedDates ? <td>{row.gap ? "—" : dateFormat.format(row.observedAt ?? row.t)}</td> : null}</tr>)}</tbody></table></div> : null}
      <p className="sr-only">{en ? "Interactive chart. Use the slider to inspect observations or open its data table." : "Gráfico interactivo. Usa el selector para explorar registros o abre su tabla de datos."}</p>
      <a href="/licenses/lightweight-charts.txt" target="_blank" rel="noopener noreferrer" className="absolute bottom-0 left-10 rounded bg-bg/90 px-1 text-[9px] text-fg-muted hover:underline" aria-label={en ? "TradingView attribution and license" : "Atribución y licencia de TradingView"}>© 2025 TradingView</a>
    </div>
  );
}

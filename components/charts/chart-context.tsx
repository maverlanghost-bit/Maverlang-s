"use client";

import { chartVolumeLabel, historyDescription, resolutionLabel, type FinancialPoint } from "@/lib/charts/data";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/hooks/use-t";
import type { Currency, HistoryMetadata } from "@/lib/types";

export function ChartContext({ source, points, currency = "USD", range, underlying, metadata, refreshing, refreshFailed, onRetry }: {
  source?: string;
  points: readonly FinancialPoint[];
  currency?: Currency;
  range?: string;
  underlying?: string;
  metadata?: HistoryMetadata;
  refreshing?: boolean;
  refreshFailed?: boolean;
  onRetry?: () => void;
}) {
  const { language } = useT();
  const en = language === "en";
  const last = points.findLast((point) => !point.gap);
  const lastTime = last?.observedAt ?? last?.t;
  const resolution = resolutionLabel(metadata?.resolution, en);
  const provider = metadata?.provider === "yahoo" ? "Yahoo Finance" : metadata?.provider === "jupiter" ? "Jupiter" : metadata?.provider === "coingecko" ? "CoinGecko" : undefined;
  const volume = metadata?.capabilities.volume ? chartVolumeLabel(metadata, en) : undefined;
  const underlyingSymbol = underlying || metadata?.providerSymbol;
  const unit = metadata?.priceUnit === "usd_per_share" ? en ? "per share" : "por acción" : metadata?.priceUnit === "usd_per_token" ? en ? "per token" : "por token" : null;
  const underlyingBars = source === "closes" && metadata?.instrument === "underlying" && metadata.capabilities.ohlc;
  const description = underlyingBars ? en ? "Underlying bars · reference" : "Barras del subyacente · referencia" : historyDescription(source, en);
  return (
    <div className="flex flex-col gap-1 text-xs leading-relaxed text-fg-muted" data-chart-source={source ?? "unavailable"}>
      <p>
        {description}{source === "closes" && underlyingSymbol ? ` · ${underlyingSymbol}` : ""}
        {provider ? ` · ${provider}` : ""}{` · ${currency}`}{unit ? ` ${unit}` : ""}
        {resolution ? ` · ${resolution}` : ""}
        {lastTime && Number.isFinite(lastTime) ? <> · {underlyingBars ? en ? "Last bar" : "Última barra" : en ? "Last observation" : "Último registro"}: <time dateTime={new Date(lastTime).toISOString()}>{formatDateTime(new Date(lastTime).toISOString())}</time></> : null}
      </p>
      {refreshing ? <p role="status">{en ? "Updating history; available observations remain visible." : "Actualizando historial; se conservan los registros disponibles."}</p> : null}
      {refreshFailed ? <p role="status" className="text-warn">{en ? "History could not be refreshed. Showing the available observations." : "No pudimos actualizar el historial. Se muestran los registros disponibles."}{onRetry ? <> <button type="button" onClick={onRetry} className="min-h-9 underline underline-offset-2">{en ? "Retry" : "Reintentar"}</button></> : null}</p> : null}
      {volume ? <p>{volume}{en ? "; unconverted traded units, not token volume." : "; unidades negociadas sin conversión, no volumen del token."}</p> : null}
      {underlyingBars ? <p>{en ? "The last bar may still be forming and may change as the source updates; a confirmed close is not available." : "La última barra puede estar en formación y cambiar cuando se actualiza la fuente; no se dispone de confirmación de cierre."}</p> : null}
      {metadata?.priceAdjustment === "stored" ? <p>{en ? "Stored closes; the historical corporate-action adjustment is not specified." : "Cierres almacenados; el ajuste histórico por eventos corporativos no está especificado."}</p> : null}
      {currency === "CLP" ? <p>{en ? "Converted at the current reference exchange rate; this is not a historical return in CLP." : "Conversión al dólar de referencia actual; no representa la rentabilidad histórica en pesos."}</p> : null}
      {range === "1D" ? <p>{source === "ticks"
        ? en ? "1D includes up to two days of token price samples; it is not strictly the last 24 hours." : "1D incluye hasta dos días de sondeos del precio del token; no corresponde estrictamente a las últimas 24 horas."
        : source === "closes"
          ? en ? "1D shows available underlying observations at the source resolution; market sessions may span more than 24 hours." : "1D muestra los registros disponibles del subyacente según la resolución de la fuente; las jornadas pueden abarcar más de 24 horas."
          : source === "mock"
            ? en ? "1D shows a demo history window." : "1D muestra una ventana de historial de demostración."
            : en ? "1D shows the available history window; its source is unavailable." : "1D muestra la ventana de historial disponible; su fuente no está disponible."}</p> : null}
      {metadata?.instrument === "underlying" ? <p>{en ? "Underlying reference prices are separate from the token quote. The product trades 24/7; prices may vary more outside regular US market hours." : "La referencia del subyacente es distinta de la cotización del token. El producto opera 24/7; fuera del horario regular de EE.UU. el precio puede variar más."}</p> : null}
      <p>{en ? "Indicative prices. The trade quote determines the final price, impact and costs." : "Precios orientativos. La cotización de la operación determina precio final, impacto y costes."}</p>
    </div>
  );
}

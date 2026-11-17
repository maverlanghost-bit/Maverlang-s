"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";

import { Sparkline } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import type { MoverCard as MoverCardData } from "@/lib/market/movers";

/**
 * Fila de dato del ranking: el mismo relleno lateral que las filas de la tabla
 * del mercado, sin cápsula ni sombra. El hairline lo pone el `divide-y` de la
 * lista que la contiene.
 */
export const moverCardClass =
  "flex min-h-12 w-full items-center gap-3 px-2 py-2 transition-colors duration-150 hover:bg-surface-1/70 active:bg-surface-1 motion-reduce:transition-none sm:px-3";

/**
 * Variación como cifra tabular: signo y color, sin cápsula. 13px, el mismo
 * cuerpo que las líneas de dato del mercado.
 */
export function ChangeText({ value, className }: { value: number; className?: string }) {
  const finite = Number.isFinite(value);
  const flat = !finite || value === 0;
  const word = flat ? "Sin cambio" : value > 0 ? "Sube" : "Baja";
  return (
    <span
      className={cn(
        "num text-[13px] leading-5 font-medium tabular-nums",
        flat ? "text-fg-muted" : value > 0 ? "text-up" : "text-down",
        className,
      )}
    >
      <span className="sr-only">{word}</span>
      {finite ? formatPercent(value) : "—"}
    </span>
  );
}

function provenance(card: MoverCardData, language: "en" | "es"): string {
  const meta = card.metadata;
  if (!meta) return `${language === "en" ? "Source and dates unavailable" : "Fuente y fechas no disponibles"}${card.stale ? (language === "en" ? " · cached, updating" : " · guardado, actualizando") : ""}`;
  const source = meta.source === "mock"
    ? (language === "en" ? "Demo prices" : "Precios de demostración")
    : meta.source === "closes"
      ? (language === "en" ? "Underlying reference closes" : "Cierres de referencia del subyacente")
      : (language === "en" ? "Token price samples" : "Sondeos del precio del token");
  const formatter = new Intl.DateTimeFormat(language === "en" ? "en" : "es-CL", {
    timeZone: "America/Santiago", dateStyle: "short", ...(meta.source === "closes" ? {} : { timeStyle: "short" }),
  });
  const dates = (from: number, to: number) => `${formatter.format(from)} – ${formatter.format(to)}`;
  const provider = meta.source === "mock" ? "" : meta.provider && meta.provider !== "unknown" ? ` · ${meta.provider}` : (language === "en" ? " · provider unavailable" : " · proveedor no disponible");
  const stale = card.stale ? (language === "en" ? " · cached, updating" : " · guardado, actualizando") : "";
  return `${source}${provider} · ${language === "en" ? "change" : "variación"}: ${dates(meta.changeFrom, meta.changeTo)} · ${language === "en" ? "chart" : "gráfico"}: ${dates(meta.sparkFrom, meta.sparkTo)}${stale}`;
}
function stockPath(symbol: string): string {
  return `/app/accion/${encodeURIComponent(symbol)}`;
}

/**
 * Navega a la ficha sin etiqueta de enlace. El e2e del mercado cuenta cada enlace
 * de acción en toda la página y exige que haya uno solo.
 */
function useOpenStock(path: string) {
  const router = useRouter();
  function open() {
    router.push(path);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open();
  }
  return { onClick: open, onKeyDown };
}

export function MoverCard({
  card,
  label,
  rank,
  language,
}: {
  card: MoverCardData;
  /** Nombre accesible, ya armado. */
  label: string;
  /** Posición opcional en el ranking (1..5). */
  rank?: number;
  language: "en" | "es";
}) {
  const path = stockPath(card.symbol);
  const open = useOpenStock(path);
  return (
    <div role="link" tabIndex={0} aria-label={`${label}. ${provenance(card, language)}`} className={cn(moverCardClass, "cursor-pointer")} {...open}>
      {rank !== undefined ? (
        <span aria-hidden className="num w-4 shrink-0 text-[13px] leading-5 tabular-nums text-fg-subtle">
          {rank}
        </span>
      ) : null}
      <TickerLogo
        symbol={card.symbol}
        name={card.name}
        logoUrl={card.logoUrl}
        size={28}
        decorative
        loading="eager"
        sizes="28px"
      />
      <span aria-hidden className="flex min-w-0 flex-1 flex-col"><span className="flex min-w-0 items-baseline gap-2">
        <span className="num shrink-0 text-[13px] leading-5 font-semibold tracking-tight text-fg">{card.symbol}</span>
        <span className="min-w-0 truncate text-[13px] leading-5 text-fg-muted" title={card.name}>
          {card.name}
        </span>
        </span><span className="text-[11px] leading-4 text-fg-muted">{provenance(card, language)}</span>
      </span>
      <Sparkline
        data={card.spark}
        change={card.changePct}
        width={48}
        height={18}
        className="hidden shrink-0 sm:block"
      />
      <span aria-hidden className="shrink-0 text-right">
        <ChangeText value={card.changePct} />
      </span>
    </div>
  );
}

/**
 * Índice del día (S&P 500 vía SPYx) como dato en línea: rótulo, símbolo y
 * variación tabular. Vive en la banda de título de «Hoy»; no es una cápsula.
 */
export function SpyChip({
  card,
  name,
  label,
  language,
}: {
  card: MoverCardData;
  name: string;
  label: string;
  language: "en" | "es";
}) {
  const path = stockPath(card.symbol);
  const open = useOpenStock(path);
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`${label}. ${provenance(card, language)}`}
      className="group inline-flex min-h-11 max-w-full cursor-pointer items-center sm:min-h-8"
      {...open}
    >
      <span aria-hidden className="inline-flex min-w-0 flex-wrap items-center gap-2">
        <span className="truncate text-[13px] leading-5 text-fg-muted">{name}</span>
        <span className="num shrink-0 text-[13px] leading-5 font-medium text-fg group-hover:underline group-hover:underline-offset-4">
          {card.symbol}
        </span>
        <Sparkline
          data={card.spark}
          change={card.changePct}
          width={44}
          height={16}
          className="hidden min-[360px]:block"
        />
        <ChangeText value={card.changePct} />
        <span className="text-[11px] leading-4 text-fg-muted">{provenance(card, language)}</span>
      </span>
    </div>
  );
}

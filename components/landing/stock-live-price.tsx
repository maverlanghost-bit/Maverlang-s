"use client";

import { useEffect, useRef, useState } from "react";

import { ChangeBadge } from "@/components/domain/change-badge";
import { PriceText } from "@/components/domain/price-text";
import { getPrices } from "@/lib/api/client";
import { cn } from "@/lib/cn";

/**
 * Precio público del token en la ficha de marketing.
 *
 * Pide `/api/prices?symbols=` con `getPrices` (el cliente de la app, que valida
 * el contrato) una vez al montar y cada 30 s mientras la pestaña está visible
 * (`document.visibilityState`). No usa TanStack Query para no depender de un
 * `QueryClientProvider` en la landing.
 *
 * Estados honestos: nunca se dice «en vivo» sobre un precio que no lo es.
 * - `ready` con fuente real → «En vivo · cada 30 s» (punto verde).
 * - `ready` con `mock`/`reference` → «Precio de referencia · demo» (punto
 *   neutro): la demo no entrega precios de mercado.
 * - `stale` (la API marcó el precio como guardado, o falló un refresco con un
 *   precio bueno previo) → se conserva el último precio y se avisa «Precio
 *   atrasado» (punto ámbar).
 * - `missing` (la respuesta no trae el símbolo) y `error` (la llamada falló)
 *   no inventan un número: muestran un guion y el motivo.
 */
export const STOCK_PRICE_REFRESH_MS = 30_000;

type LiveQuote = {
  /** Símbolo al que pertenece el precio: evita mostrar el de otra ficha. */
  symbol: string;
  priceUsd: number;
  /** Ratio, igual que el resto de la app: 0,0123 → +1,23 %. */
  change: number | null;
  /** `true` si el servidor entregó la ancla en vez de un precio de mercado. */
  reference: boolean;
  /** `true` si la cotización viene del modo demo (`source: "mock"`). */
  demo: boolean;
  /** `true` si el precio es el último guardado tras un 429 o un error (M38). */
  stale: boolean;
};

type LiveStatus = "loading" | "ready" | "stale" | "missing" | "error";

/**
 * Alto reservado por tamaño. El bloque de precio (carga, dato y estado) ocupa
 * siempre lo mismo: la ficha no salta cuando llega la cotización.
 */
const sizeFrame = {
  sm: "min-h-5",
  md: "min-h-7",
  lg: "min-h-12",
} as const;

/** Tamaño del guion cuando no hay dato: el mismo cuerpo que el precio. */
const placeholderSize = {
  sm: "text-sm",
  md: "text-xl sm:text-2xl",
  lg: "text-4xl sm:text-5xl",
} as const;

export type StockLivePriceSize = keyof typeof sizeFrame;

/** Cotización de `symbol` dentro de la respuesta de `/api/prices`. */
function pickQuote(
  quotes: readonly {
    symbol: string;
    priceUsd: number;
    change24hPct: number;
    source: "jupiter" | "mock";
    reference?: boolean;
    stale?: boolean;
  }[],
  symbol: string,
): LiveQuote | null {
  const wanted = symbol.trim().toLowerCase();
  const match = quotes.find((item) => item.symbol.toLowerCase() === wanted);
  if (!match || !Number.isFinite(match.priceUsd) || match.priceUsd <= 0) return null;
  return {
    symbol: match.symbol,
    priceUsd: match.priceUsd,
    change: Number.isFinite(match.change24hPct) ? match.change24hPct : null,
    reference: match.source === "mock" || match.reference === true,
    demo: match.source === "mock",
    stale: match.stale === true,
  };
}

const dotTone = {
  live: "bg-up",
  warn: "bg-warn",
  muted: "bg-fg-subtle",
} as const;

/** Línea de estado bajo el precio: punto + palabra, sin prometer frescura. */
function PriceStatus({ tone, label }: { tone: keyof typeof dotTone; label: string }) {
  return (
    <p
      className={cn(
        "mt-2 inline-flex items-center gap-1.5 text-xs font-medium",
        tone === "live" ? "text-up" : tone === "warn" ? "text-warn" : "text-fg-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          dotTone[tone],
          tone === "live" && "motion-safe:animate-pulse",
        )}
      />
      {label}
    </p>
  );
}

export function StockLivePrice({
  symbol,
  size = "md",
  showStatus = false,
  className,
}: {
  symbol: string;
  /** `lg` para la ficha (hero): 36 px en móvil, 48 px desde sm. */
  size?: StockLivePriceSize;
  /** Muestra la línea de estado (en vivo / referencia / atrasado). */
  showStatus?: boolean;
  className?: string;
}) {
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [status, setStatus] = useState<LiveStatus>("loading");
  /** Símbolo del último precio bueno: si cambia la ficha, no se reutiliza. */
  const hasQuote = useRef<string | null>(null);

  useEffect(() => {
    const key = symbol.trim().toLowerCase();
    let timer: number | null = null;
    let stopped = false;

    function stopTimer() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    async function load() {
      if (stopped) return;
      try {
        const quotes = await getPrices([symbol]);
        if (stopped) return;
        const next = pickQuote(quotes, symbol);
        if (!next) {
          // Respuesta válida sin el símbolo: no es un fallo de red, es un dato
          // que el mercado no entrega. Se conserva el último bueno si existe.
          setStatus(hasQuote.current === key ? "stale" : "missing");
          return;
        }
        hasQuote.current = key;
        setQuote(next);
        setStatus(next.stale ? "stale" : "ready");
      } catch {
        if (stopped) return;
        if (hasQuote.current === key) {
          setStatus("stale");
          return;
        }
        setQuote(null);
        setStatus("error");
      }
    }

    function startTimer() {
      stopTimer();
      if (stopped || document.visibilityState !== "visible") return;
      timer = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void load();
      }, STOCK_PRICE_REFRESH_MS);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void load();
        startTimer();
        return;
      }
      stopTimer();
    }

    void load();
    startTimer();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [symbol]);

  // Si el símbolo cambió, el precio guardado es de otra ficha: no se muestra.
  const current = quote && quote.symbol.trim().toLowerCase() === symbol.trim().toLowerCase() ? quote : null;

  if (current) {
    const stale = status === "stale" || current.stale;
    return (
      <div className={cn("flex flex-col", className)}>
        <div className={cn("flex flex-wrap items-baseline gap-x-2.5 gap-y-1", sizeFrame[size])}>
          <PriceText value={current.priceUsd} currency="USD" size={size} live={!stale && !current.reference} />
          {current.change !== null ? (
            <>
              <ChangeBadge value={current.change} className={size === "lg" ? "text-sm" : undefined} />
              {/* El período es parte del dato: sin él, el % no dice nada. */}
              <span className="text-xs text-fg-muted">24 h</span>
            </>
          ) : (
            /* Sin variación no se dibuja un 0 %: se dice que no hay dato. */
            <span className="text-xs text-fg-muted">24 h sin dato</span>
          )}
        </div>
        {showStatus ? (
          stale ? (
            <PriceStatus tone="warn" label="Precio atrasado" />
          ) : current.reference ? (
            <PriceStatus
              tone="muted"
              label={current.demo ? "Precio de referencia · demo" : "Precio de referencia"}
            />
          ) : (
            <PriceStatus tone="live" label="En vivo · cada 30 s" />
          )
        ) : null}
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div aria-live="polite" className={cn("flex flex-col", sizeFrame[size], className)}>
        <div className="flex items-center">
          <span
            aria-hidden
            className={cn(
              "block rounded-lg bg-surface-2 motion-safe:animate-pulse",
              size === "lg" ? "h-8 w-40" : "h-5 w-24",
            )}
          />
          <span className="sr-only">Cargando precio…</span>
        </div>
        {/* Reserva el alto de la línea de estado: el hero no salta al llegar el dato. */}
        {showStatus ? <span aria-hidden className="mt-2 block h-4" /> : null}
      </div>
    );
  }

  return (
    <div aria-live="polite" className={cn("flex flex-col", sizeFrame[size], className)}>
      <span aria-hidden className={cn("num leading-none text-fg-subtle", placeholderSize[size])}>
        —
      </span>
      <p className="mt-1.5 text-xs text-fg-muted">
        {status === "missing" ? "Sin dato de precio" : "Precio no disponible"}
      </p>
    </div>
  );
}

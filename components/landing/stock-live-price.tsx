"use client";

import { useEffect, useState } from "react";

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
 * `QueryClientProvider` en la landing. Si la llamada falla se muestra "Precio
 * no disponible": nunca un número fijo ni un precio de ejemplo.
 */
export const STOCK_PRICE_REFRESH_MS = 30_000;

type LiveQuote = {
  priceUsd: number;
  /** Ratio, igual que el resto de la app: 0,0123 → +1,23 %. */
  change: number | null;
};

type LiveStatus = "loading" | "ready" | "error";

/**
 * Alto reservado por tamaño. El bloque de precio (carga, error y dato) ocupa
 * siempre lo mismo: el panel y el hero no saltan cuando llega la cotización.
 */
const sizeFrame = {
  sm: "min-h-5",
  md: "min-h-7",
  lg: "min-h-12",
} as const;

export type StockLivePriceSize = keyof typeof sizeFrame;

/** Cotización de `symbol` dentro de la respuesta de `/api/prices`. */
function pickQuote(
  quotes: readonly { symbol: string; priceUsd: number; change24hPct: number }[],
  symbol: string,
): LiveQuote | null {
  const wanted = symbol.trim().toLowerCase();
  const match = quotes.find((item) => item.symbol.toLowerCase() === wanted);
  if (!match || !Number.isFinite(match.priceUsd) || match.priceUsd <= 0) return null;
  return {
    priceUsd: match.priceUsd,
    change: Number.isFinite(match.change24hPct) ? match.change24hPct : null,
  };
}

export function StockLivePrice({
  symbol,
  size = "md",
  className,
}: {
  symbol: string;
  /** `lg` para la ficha (hero y panel): 36 px en móvil, 48 px desde sm. */
  size?: StockLivePriceSize;
  className?: string;
}) {
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [status, setStatus] = useState<LiveStatus>("loading");

  useEffect(() => {
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
        if (!next) throw new Error("Sin cotización");
        setQuote(next);
        setStatus("ready");
      } catch {
        if (stopped) return;
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

  if (status === "ready" && quote) {
    return (
      <div className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1", sizeFrame[size], className)}>
        <PriceText value={quote.priceUsd} currency="USD" size={size} live />
        {/* Con el precio grande el badge sube un paso para no quedar diminuto al lado. */}
        {quote.change !== null ? (
          <ChangeBadge value={quote.change} className={size === "lg" ? "text-sm" : undefined} />
        ) : null}
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div aria-live="polite" className={cn("flex items-center", sizeFrame[size], className)}>
        <span
          aria-hidden
          className={cn(
            "block rounded-lg bg-surface-2 motion-safe:animate-pulse",
            size === "lg" ? "h-8 w-40" : "h-5 w-24",
          )}
        />
        <span className="sr-only">Cargando precio…</span>
      </div>
    );
  }

  return (
    <div aria-live="polite" className={cn("flex items-center", sizeFrame[size], className)}>
      <p className="text-sm text-fg-muted">Precio no disponible</p>
    </div>
  );
}

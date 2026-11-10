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

export function StockLivePrice({ symbol, className }: { symbol: string; className?: string }) {
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
      <div className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1", className)}>
        <PriceText value={quote.priceUsd} currency="USD" size="md" live />
        {quote.change !== null ? <ChangeBadge value={quote.change} /> : null}
      </div>
    );
  }

  return (
    <p aria-live="polite" className={cn("text-sm text-fg-muted", className)}>
      {status === "error" ? "Precio no disponible" : "Cargando precio…"}
    </p>
  );
}

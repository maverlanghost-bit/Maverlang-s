"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { CryptoTradeSheet } from "@/components/domain/crypto-trade-sheet";
import { CryptoSubTabs } from "@/components/domain/market-section-chips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  LEGAL_REVIEW_NOTICE,
  LST_YIELD_NOTICE,
  NON_CUSTODY_LINE,
  USDY_YIELD_NOTICE,
} from "@/content/crypto-legal";
import { EARN_ASSETS, type LstAsset } from "@/lib/catalog/lst";
import { formatDateTime, formatUsd } from "@/lib/format";
import { usePrices } from "@/lib/hooks/queries";
import type { Quote } from "@/lib/types";

/**
 * Ganar: los 6 LST de Solana y USDY como opción de dólares.
 *
 * Todo es demo. Comprar o vender aquí es un swap en Jupiter a un token de
 * staking (o a USDY), NO un depósito en custodia de Maverlang. La posición
 * sigue el precio vivo del token: no se simula ningún goteo de rendimiento.
 * El APY solo se muestra si la fuente oficial lo entrega; si falta, es 0, es
 * negativo o no es numérico, se muestra "Sin dato".
 */

const APY_REFRESH_MS = 5 * 60_000;
const PRICE_REFRESH_MS = 30_000;

const STAKING_ASSETS = EARN_ASSETS.filter((asset) => asset.yieldUnit === "SOL");
const DOLLAR_ASSETS = EARN_ASSETS.filter((asset) => asset.yieldUnit === "USD");
const EARN_SYMBOLS = EARN_ASSETS.map((asset) => asset.symbol);

const SOURCE_LABEL: Record<LstAsset["apySource"], string> = {
  jito: "Jito Stake Pool",
  marinade7d: "Marinade (7 días)",
  blaze: "BlazeStake",
  none: "Sin fuente pública de APY",
};

const apyFormatter = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Respuesta de `GET /api/earn/apy` (A1). `apy` viene en porcentaje o null. */
type EarnApyItem = {
  symbol: string;
  apy: number | null;
  asOf: string | null;
  source: LstAsset["apySource"];
};

function isApySource(value: unknown): value is LstAsset["apySource"] {
  return value === "jito" || value === "marinade7d" || value === "blaze" || value === "none";
}

/**
 * Acepta la forma documentada (`{ items }`) y el sobre estándar de las rutas
 * de la app (`{ ok, data: { items } }`), sin acoplarse a uno solo.
 */
function itemsOf(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const direct = (payload as { items?: unknown }).items;
  if (Array.isArray(direct)) return direct;
  const data = (payload as { data?: unknown }).data;
  if (data && typeof data === "object") {
    const nested = (data as { items?: unknown }).items;
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

/**
 * Cliente de la ruta propia: el APY se pide al servidor, nunca a la API del
 * emisor desde el navegador. Cualquier forma inesperada se descarta y queda
 * como "Sin dato", sin inventar cifras.
 */
async function fetchEarnApy(): Promise<EarnApyItem[]> {
  const response = await fetch("/api/earn/apy", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`No pudimos leer el APY (${response.status})`);

  const payload: unknown = await response.json();
  const raw = itemsOf(payload);

  const items: EarnApyItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.symbol !== "string" || row.symbol.length === 0) continue;
    items.push({
      symbol: row.symbol,
      apy: typeof row.apy === "number" && Number.isFinite(row.apy) ? row.apy : null,
      asOf: typeof row.asOf === "string" ? row.asOf : null,
      source: isApySource(row.source) ? row.source : "none",
    });
  }
  return items;
}

/** APY utilizable: número finito y mayor que 0. Cualquier otra cosa es "Sin dato". */
function usableApy(item: EarnApyItem | undefined): number | null {
  const apy = item?.apy;
  return typeof apy === "number" && Number.isFinite(apy) && apy > 0 ? apy : null;
}

function monogram(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
}

function updatedAt(item: EarnApyItem | undefined): string | null {
  const asOf = item?.asOf;
  if (!asOf || !Number.isFinite(Date.parse(asOf))) return null;
  return formatDateTime(asOf);
}

function EarnCard({
  asset,
  apy,
  apyPending,
  price,
  pricesPending,
  onBuy,
  onSell,
}: {
  asset: LstAsset;
  apy: EarnApyItem | undefined;
  apyPending: boolean;
  price: Quote | undefined;
  pricesPending: boolean;
  onBuy: () => void;
  onSell: () => void;
}) {
  // Sin fuente oficial sin clave (JupSOL, INF, dSOL y USDY) siempre es "Sin dato",
  // aunque la ruta devolviera otra cosa: nunca se inventa un porcentaje.
  const hasSource = asset.apySource !== "none";
  const value = hasSource ? usableApy(apy) : null;
  const source = SOURCE_LABEL[apy?.source ?? asset.apySource];
  const updated = hasSource ? updatedAt(apy) : null;
  const sourceLine = `Fuente: ${source}${updated ? ` · ${updated}` : ""}`;

  return (
    <Card className="flex min-w-0 flex-col gap-4 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-xs font-medium text-fg ring-1 ring-inset ring-border select-none"
        >
          {monogram(asset.symbol)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base leading-snug font-medium tracking-tight text-fg">
              {asset.name}
            </h3>
            <span className="inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-medium tracking-tight text-fg-body ring-1 ring-inset ring-border">
              {asset.symbol}
            </span>
            {asset.usPersonBlocked ? (
              <Badge tone="warn" className="shrink-0">
                No disponible EE.UU.
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs leading-5 text-fg-muted">
            Emite {asset.issuerName} · En {asset.yieldUnit}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 border-y border-border py-3.5">
        <div className="min-w-0">
          <dt className="font-mono text-[11px] font-medium tracking-[0.045em] text-fg-muted uppercase">
            APY estimado
          </dt>
          <dd className="mt-1 flex min-h-7 items-center">
            {hasSource && apyPending ? (
              <span className="text-sm text-fg-muted">Consultando…</span>
            ) : value !== null ? (
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-up" />
                <span className="num text-lg leading-7 font-semibold tracking-tight tabular-nums text-fg">
                  {apyFormatter.format(value)}%
                </span>
              </span>
            ) : (
              <span className="text-sm font-medium text-fg-muted">Sin dato</span>
            )}
          </dd>
        </div>
        <div className="min-w-0 text-right">
          <dt className="font-mono text-[11px] font-medium tracking-[0.045em] text-fg-muted uppercase">
            Precio
          </dt>
          <dd className="mt-1 flex min-h-7 items-center justify-end">
            {price ? (
              <span className="num text-lg leading-7 font-semibold tracking-tight tabular-nums text-fg">
                {formatUsd(price.priceUsd)}
              </span>
            ) : pricesPending ? (
              <span aria-hidden className="h-5 w-20 rounded-sm bg-surface-2" />
            ) : (
              <span className="text-sm text-fg-muted">Sin precio</span>
            )}
          </dd>
        </div>
      </dl>

      <p className="truncate text-xs leading-5 text-fg-muted" title={sourceLine}>
        {sourceLine}
      </p>

      <div className="mt-auto flex gap-2 pt-1">
        <Button size="sm" className="flex-1" aria-label={`Comprar ${asset.name}`} onClick={onBuy}>
          Comprar
        </Button>
        <Button
          size="sm"
          className="flex-1"
          variant="secondary"
          aria-label={`Vender ${asset.name}`}
          onClick={onSell}
        >
          Vender
        </Button>
      </div>
    </Card>
  );
}

export function EarnScreen({ sections }: { sections?: ReactNode }) {
  const [trade, setTrade] = useState<{ symbol: string; mode: "buy" | "sell" } | null>(null);

  const apyQuery = useQuery({
    queryKey: ["earn-apy"],
    queryFn: fetchEarnApy,
    staleTime: APY_REFRESH_MS,
    refetchInterval: APY_REFRESH_MS,
    retry: 1,
  });
  const pricesQuery = usePrices(EARN_SYMBOLS, true, PRICE_REFRESH_MS);

  const apyBySymbol = useMemo(() => {
    const map = new Map<string, EarnApyItem>();
    for (const item of apyQuery.data ?? []) map.set(item.symbol.toUpperCase(), item);
    return map;
  }, [apyQuery.data]);

  const priceBySymbol = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const quote of pricesQuery.data ?? []) {
      if (!Number.isFinite(quote.priceUsd) || quote.priceUsd <= 0) continue;
      map.set(quote.symbol.toUpperCase(), quote);
    }
    return map;
  }, [pricesQuery.data]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="sr-only">Ganar</h1>

      {sections ? <div className="-mx-5 min-w-0 px-5 sm:mx-0 sm:px-0">{sections}</div> : null}

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border pb-3">
        <CryptoSubTabs active="earn" />
        <p className="text-xs leading-5 text-fg-muted">Swaps en Jupiter · Demo</p>
      </div>

      <section aria-labelledby="ganar-staking" className="flex flex-col gap-4">
        <div>
          <h2 id="ganar-staking" className="text-lg leading-tight font-medium tracking-tight text-fg">
            Staking líquido
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-fg-muted">
            Tokens de staking en Solana. El APY refleja el dato público del emisor o «Sin dato».
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {STAKING_ASSETS.map((asset) => (
            <EarnCard
              key={asset.symbol}
              asset={asset}
              apy={apyBySymbol.get(asset.symbol.toUpperCase())}
              apyPending={apyQuery.isPending}
              price={priceBySymbol.get(asset.symbol.toUpperCase())}
              pricesPending={pricesQuery.isPending}
              onBuy={() => setTrade({ symbol: asset.symbol, mode: "buy" })}
              onSell={() => setTrade({ symbol: asset.symbol, mode: "sell" })}
            />
          ))}
        </div>
      </section>

      {DOLLAR_ASSETS.length > 0 ? (
        <section aria-labelledby="ganar-dolares" className="flex flex-col gap-4 pt-2">
          <div>
            <h2 id="ganar-dolares" className="text-lg leading-tight font-medium tracking-tight text-fg">
              Dólares
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-fg-muted">
              Bono tokenizado en dólares emitido por Ondo, con restricción para personas de EE.UU.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {DOLLAR_ASSETS.map((asset) => (
              <EarnCard
                key={asset.symbol}
                asset={asset}
                apy={apyBySymbol.get(asset.symbol.toUpperCase())}
                apyPending={apyQuery.isPending}
                price={priceBySymbol.get(asset.symbol.toUpperCase())}
                pricesPending={pricesQuery.isPending}
                onBuy={() => setTrade({ symbol: asset.symbol, mode: "buy" })}
                onSell={() => setTrade({ symbol: asset.symbol, mode: "sell" })}
              />
            ))}
          </div>
        </section>
      ) : null}

      <footer
        aria-label="Notas y avisos legales"
        className="flex flex-col gap-2 border-t border-border pt-6 text-xs leading-relaxed text-fg-muted"
      >
        <p>
          Comprar o vender aquí ejecuta un swap en Jupiter que sigue el precio vivo del token; no es un
          depósito de ahorro en custodia.
        </p>
        <p>{LST_YIELD_NOTICE}</p>
        <p>{USDY_YIELD_NOTICE}</p>
        <p>
          {NON_CUSTODY_LINE} {LEGAL_REVIEW_NOTICE}
        </p>
      </footer>

      {trade ? (
        <CryptoTradeSheet
          symbol={trade.symbol}
          open
          mode={trade.mode}
          onClose={() => setTrade(null)}
          onDone={() => {
            void pricesQuery.refetch();
            void apyQuery.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

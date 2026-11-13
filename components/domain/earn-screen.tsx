"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { CryptoTradeSheet } from "@/components/domain/crypto-trade-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  LEGAL_REVIEW_NOTICE,
  LST_YIELD_NOTICE,
  NON_CUSTODY_LINE,
  USDY_YIELD_NOTICE,
} from "@/content/crypto-legal";
import { LST_ASSETS, type LstAsset } from "@/lib/catalog/lst";
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
 * negativo o no es numérico, se muestra "sin dato".
 */

const APY_REFRESH_MS = 5 * 60_000;
const PRICE_REFRESH_MS = 30_000;

const STAKING_ASSETS = LST_ASSETS.filter((asset) => asset.yieldUnit === "SOL");
const DOLLAR_ASSETS = LST_ASSETS.filter((asset) => asset.yieldUnit === "USD");
const EARN_SYMBOLS = LST_ASSETS.map((asset) => asset.symbol);

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
 * como "sin dato", sin inventar cifras.
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

/** APY utilizable: número finito y mayor que 0. Cualquier otra cosa es "sin dato". */
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
  onBuy,
  onSell,
}: {
  asset: LstAsset;
  apy: EarnApyItem | undefined;
  apyPending: boolean;
  price: Quote | undefined;
  onBuy: () => void;
  onSell: () => void;
}) {
  const isDollar = asset.yieldUnit === "USD";
  // Sin fuente oficial sin clave (JupSOL, INF, dSOL y USDY) siempre es "sin dato",
  // aunque la ruta devolviera otra cosa: nunca se inventa un porcentaje.
  const hasSource = asset.apySource !== "none";
  const value = hasSource ? usableApy(apy) : null;
  const source = SOURCE_LABEL[apy?.source ?? asset.apySource];
  const updated = hasSource ? updatedAt(apy) : null;

  return (
    <Card className="flex min-w-0 flex-col gap-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-xs font-medium text-fg"
        >
          {monogram(asset.symbol)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-medium tracking-tight text-balance">
              {asset.name}
            </h3>
            <Badge tone="neutral">{asset.symbol}</Badge>
          </div>
          <p className="mt-0.5 text-[13px] leading-5 text-fg-muted">
            {isDollar ? "Dólares" : "Staking"} · Emite {asset.issuerName}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 border-y border-border py-3">
        <div className="min-w-0">
          <dt className="label-xs">APY</dt>
          <dd className="mt-1 min-h-7">
            <span className="num block text-lg leading-7 tracking-tight text-fg tabular-nums">
              {hasSource && apyPending ? (
                <span className="text-sm text-fg-muted">consultando…</span>
              ) : value !== null ? (
                <>
                  {apyFormatter.format(value)}
                  <span className="text-xs"> %</span>
                </>
              ) : (
                <span className="text-sm text-fg-muted">sin dato</span>
              )}
            </span>
          </dd>
        </div>
        <div className="min-w-0 text-right">
          <dt className="label-xs">Precio</dt>
          <dd className="mt-1 min-h-7">
            <span className="num block text-lg leading-7 tracking-tight text-fg tabular-nums">
              {price ? (
                formatUsd(price.priceUsd)
              ) : (
                <span className="text-sm text-fg-muted">sin precio</span>
              )}
            </span>
            <span className="block text-xs leading-4 text-fg-muted">USD por token</span>
          </dd>
        </div>
      </dl>

      <p className="text-xs leading-relaxed text-fg-muted">
        {asset.yieldUnit === "SOL" ? "Rendimiento en SOL" : "Rendimiento en USD"} · Fuente: {source}
        {updated ? ` · ${updated}` : ""}
      </p>

      {asset.usPersonBlocked ? (
        <Badge tone="warn" className="w-fit whitespace-normal">
          No disponible para personas de EE.UU.
        </Badge>
      ) : null}

      <p className="text-xs leading-relaxed text-fg-body">
        {isDollar ? USDY_YIELD_NOTICE : LST_YIELD_NOTICE}
      </p>

      <div className="mt-auto flex flex-wrap gap-2">
        <Button className="flex-1" aria-label={`Comprar ${asset.name}`} onClick={onBuy}>
          Comprar
        </Button>
        <Button
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

export function EarnScreen() {
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
    for (const quote of pricesQuery.data ?? []) map.set(quote.symbol.toUpperCase(), quote);
    return map;
  }, [pricesQuery.data]);

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        title="Ganar"
        description="Tokens de staking de Solana y USDY con tu saldo demo. Comprar es un swap en Jupiter: la posición queda registrada en tu billetera de la demo y su valor sigue el precio vivo."
      />

      <section
        aria-labelledby="ganar-antes"
        className="flex flex-col gap-3 border-y border-border py-5"
      >
        <h2 id="ganar-antes" className="text-base font-medium tracking-tight">
          Antes de comprar
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-fg-body">
          <li>Comprar en Ganar es un swap a un token de staking en Jupiter, no un depósito custodiado.</li>
          <li>La posición queda en tu billetera de la demo. {NON_CUSTODY_LINE}</li>
          <li>El valor de tu posición sigue el precio vivo del token. No simulamos un goteo de rendimiento.</li>
        </ul>
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <p className="label">Tokens de staking (LST)</p>
          <p className="text-[13px] leading-relaxed text-fg-body">{LST_YIELD_NOTICE}</p>
        </div>
        <p className="text-xs leading-relaxed text-fg-muted">{LEGAL_REVIEW_NOTICE}</p>
      </section>

      <section aria-labelledby="ganar-staking" className="flex flex-col gap-4">
        <div>
          <h2 id="ganar-staking" className="text-xl font-medium tracking-tight">
            Tokens de staking
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-fg-muted">
            Seis LST de Solana. El APY es el que publica el emisor; si la fuente no responde, entrega
            0 o un valor que no es un número, mostramos «sin dato».
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
              onBuy={() => setTrade({ symbol: asset.symbol, mode: "buy" })}
              onSell={() => setTrade({ symbol: asset.symbol, mode: "sell" })}
            />
          ))}
        </div>
      </section>

      {DOLLAR_ASSETS.length > 0 ? (
        <section aria-labelledby="ganar-dolares" className="flex flex-col gap-4">
          <div>
            <h2 id="ganar-dolares" className="text-xl font-medium tracking-tight">
              Dólares
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-fg-muted">
              USDY es una opción en dólares dentro de Ganar, con su propio aviso y su restricción
              para personas de EE.UU.
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
                onBuy={() => setTrade({ symbol: asset.symbol, mode: "buy" })}
                onSell={() => setTrade({ symbol: asset.symbol, mode: "sell" })}
              />
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-xs leading-relaxed text-fg-muted">
        {NON_CUSTODY_LINE} {LEGAL_REVIEW_NOTICE}
      </p>

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

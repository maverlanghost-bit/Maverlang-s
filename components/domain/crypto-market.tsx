"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { ChangeBadge } from "@/components/domain/change-badge";
import { CryptoBadgeIcon } from "@/components/domain/crypto-badge-icon";
import { CryptoSubTabs } from "@/components/domain/market-section-chips";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { IconChevron, IconClose, IconSearch } from "@/components/ui/icons";
import { indexFromKey } from "@/components/ui/keys";
import { Skeleton } from "@/components/ui/skeleton";
import { MIN_TRADE_USD } from "@/config/trade";
import { BRIDGED_TOKEN_NOTICE, LEGAL_REVIEW_NOTICE, NON_CUSTODY_LINE } from "@/content/crypto-legal";
import { apiResultSchema } from "@/lib/api/contracts";
import type { CryptoAsset, CryptoGroup, CryptoSector } from "@/lib/catalog/crypto-types";
import { cn } from "@/lib/cn";
import { formatMoney, formatPercent } from "@/lib/format";
import { useFx, usePortfolio, usePrices } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice, fold } from "@/lib/market/browse";
import { formatUnitPrice } from "@/lib/market/price-format";
import { parseAmount } from "@/lib/trade/amount";
import type { Currency, Position, Quote } from "@/lib/types";

/** La lista cambia poco: se refresca al volver a entrar, no en cada tick. */
const LIST_STALE_MS = 5 * 60_000;

/** Retícula de la tabla: activo · cambio 24h · sello/tope · precio vivo · acción. Sólo desde sm. */
const ROW_COLUMNS = "sm:grid-cols-[minmax(0,1.4fr)_6.5rem_7.75rem_8rem_5.75rem]";

type CryptoFilterValue = "all" | CryptoSector | "portfolio";
type CryptoSortValue = "featured" | "gain" | "loss" | "price-desc" | "price-asc";

const FEATURED_PRIORITY = ["BTC", "SOL", "ETH", "JUP", "XRP", "BNB"] as const;
const QUICK_BUY_CANDIDATES = ["BTC", "SOL", "ETH", "JUP", "RAY", "BONK", "XAUt0"] as const;
const QUICK_AMOUNT_PRESETS = [25, 100, 250] as const;

const SECTOR_OPTIONS: readonly { value: Exclude<CryptoFilterValue, "portfolio">; labelEs: string; labelEn: string }[] = [
  { value: "all", labelEs: "Todas", labelEn: "All" },
  { value: "bluechip", labelEs: "Principales", labelEn: "Bluechips" },
  { value: "solana-defi", labelEs: "Solana & DeFi", labelEn: "Solana & DeFi" },
  { value: "ai-infra", labelEs: "IA & Infra", labelEn: "AI & Infra" },
  { value: "meme", labelEs: "Memes", labelEn: "Memes" },
  { value: "dollar", labelEs: "Dólares", labelEn: "Dollars" },
  { value: "gold", labelEs: "Oro", labelEn: "Gold" },
];

const SORT_OPTIONS: readonly { value: CryptoSortValue; labelEs: string; labelEn: string }[] = [
  { value: "featured", labelEs: "Destacadas", labelEn: "Featured" },
  { value: "gain", labelEs: "Mayor alza 24h", labelEn: "Top gainers 24h" },
  { value: "loss", labelEs: "Mayor baja 24h", labelEn: "Top losers 24h" },
  { value: "price-desc", labelEs: "Mayor precio", labelEn: "Highest price" },
  { value: "price-asc", labelEs: "Menor precio", labelEn: "Lowest price" },
];

const FALLBACK_MEME_SYMBOLS = new Set([
  "DOGE",
  "PEPE",
  "BONK",
  "WIF",
  "POPCAT",
  "PENGU",
  "TRUMP",
  "FARTCOIN",
  "PUMP",
]);

const FALLBACK_DEFI_SYMBOLS = new Set([
  "JUP",
  "RAY",
  "LINK",
  "UNI",
  "ENA",
  "AAVE",
  "ONDO",
  "KMNO",
  "PYTH",
  "JTO",
  "ORCA",
  "DRIFT",
  "W",
]);

const FALLBACK_AI_SYMBOLS = new Set(["TAO", "RENDER", "HNT"]);

const cryptoSectorSchema = z.enum(["bluechip", "solana-defi", "ai-infra", "meme", "dollar", "gold"]);

/**
 * Contrato de `GET /api/crypto/list`. `sector` es opcional en el borde por
 * resiliencia; si falta en tiempo de ejecución se infiere desde `group` y símbolo.
 */
const cryptoListSchema = z.object({
  items: z.array(
    z.object({
      symbol: z.string().min(1),
      name: z.string().min(1),
      mint: z.string().min(32),
      decimals: z.number().int().nonnegative().nullable(),
      seal: z.enum(["VERDE", "AMARILLO"]),
      group: z.enum(["crypto", "dollar", "gold"]),
      sector: cryptoSectorSchema.optional(),
      originLabel: z.string().min(1),
      maxOrderUsd: z.number().positive(),
    }),
  ),
});

function inferSector(item: { symbol: string; group: CryptoGroup; sector?: CryptoSector }): CryptoSector {
  if (item.sector) return item.sector;
  if (item.group === "dollar") return "dollar";
  if (item.group === "gold") return "gold";
  const upper = item.symbol.trim().toUpperCase();
  if (FALLBACK_MEME_SYMBOLS.has(upper)) return "meme";
  if (FALLBACK_DEFI_SYMBOLS.has(upper)) return "solana-defi";
  if (FALLBACK_AI_SYMBOLS.has(upper)) return "ai-infra";
  return "bluechip";
}

async function fetchCryptoList(): Promise<CryptoAsset[]> {
  let response: Response;
  try {
    response = await fetch("/api/crypto/list", {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
  } catch {
    throw new Error("No pudimos conectar.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("La lista de criptos no llegó en JSON.");
  }

  const normalize = (items: z.infer<typeof cryptoListSchema>["items"]): CryptoAsset[] =>
    items.map((item) => ({
      ...item,
      sector: inferSector(item),
    }));

  // Las rutas del proyecto responden `{ ok, data }`; se acepta también la
  // lista directa para no romper si el endpoint público la sirve sin sobre.
  const envelope = apiResultSchema(cryptoListSchema).safeParse(payload);
  if (envelope.success) {
    if (envelope.data.ok) return normalize(envelope.data.data.items);
    throw new Error(envelope.data.error.message);
  }
  const direct = cryptoListSchema.safeParse(payload);
  if (direct.success) return normalize(direct.data.items);
  throw new Error("La lista de criptos no tiene el formato esperado.");
}

const usdTope = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const qtyFormatterHigh = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 2,
});

const qtyFormatterMid = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 4,
});

const qtyFormatterFine = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 6,
});

function formatTokenQty(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1_000) return qtyFormatterHigh.format(value);
  if (value >= 1) return qtyFormatterMid.format(value);
  return qtyFormatterFine.format(value);
}

/** Formatea un precio USD en USD o CLP preservando decimales para tokens baratos. */
function formatCryptoPrice(
  priceUsd: number,
  currency: Currency,
  rate: number | undefined,
): { formatted: string; shownCurrency: Currency } {
  const converted = displayPrice(priceUsd, currency, rate);
  const shownCurrency: Currency = converted !== null ? currency : "USD";
  const value = converted ?? priceUsd;

  return { formatted: formatUnitPrice(value, shownCurrency), shownCurrency };
}

function formatTotalAmount(usd: number, currency: Currency, rate: number | undefined): string {
  const converted = displayPrice(usd, currency, rate);
  if (converted !== null) return formatMoney(converted, currency);
  return formatMoney(usd, "USD");
}

/** Tope por orden, sin centavos. */
function topeLabel(value: number): string {
  return usdTope.format(value);
}

/** Conteo real, con singular honesto. */
function assetCount(value: number, isEn: boolean): string {
  if (isEn) return `${value} ${value === 1 ? "asset" : "assets"}`;
  return `${value} ${value === 1 ? "activo" : "activos"}`;
}

/**
 * Precio vivo utilizable: acepta Jupiter o mock siempre que no sea `reference`
 * y tenga precio positivo finito, devolviendo el `Quote` completo con `change24hPct`.
 */
function usablePrices(quotes: readonly Quote[] | undefined): Map<string, Quote> {
  const map = new Map<string, Quote>();
  for (const quote of quotes ?? []) {
    if (quote.source !== "jupiter" && quote.source !== "mock") continue;
    if (quote.reference === true) continue;
    if (!Number.isFinite(quote.priceUsd) || quote.priceUsd <= 0) continue;
    map.set(quote.symbol.toLowerCase(), quote);
  }
  return map;
}

function changePctOf(quote: Quote | undefined): number | null {
  if (!quote || !Number.isFinite(quote.change24hPct)) return null;
  return quote.change24hPct;
}

function CryptoPortfolioSummary({
  positions,
  assetsByLower,
  prices,
  currency,
  rate,
  isEn,
}: {
  positions: readonly Position[];
  assetsByLower: ReadonlyMap<string, CryptoAsset>;
  prices: ReadonlyMap<string, Quote>;
  currency: Currency;
  rate: number | undefined;
  isEn: boolean;
}) {
  let totalCryptoUsd = 0;
  let dayPnlUsd = 0;
  let prevTotalUsd = 0;
  let hasDailyDelta = false;

  const chips: { asset: CryptoAsset; valueUsd: number; shares: number }[] = [];

  for (const position of positions) {
    const asset = assetsByLower.get(position.symbol.toLowerCase());
    if (!asset || !(position.shares > 0)) continue;
    const quote = prices.get(asset.symbol.toLowerCase());
    const valueUsd = quote ? position.shares * quote.priceUsd : position.valueUsd;
    if (!Number.isFinite(valueUsd) || valueUsd <= 0) continue;
    totalCryptoUsd += valueUsd;
    chips.push({ asset, valueUsd, shares: position.shares });

    const change = changePctOf(quote);
    if (quote && change !== null && 1 + change > 0) {
      const prev = valueUsd / (1 + change);
      dayPnlUsd += valueUsd - prev;
      prevTotalUsd += prev;
      hasDailyDelta = true;
    }
  }

  if (chips.length === 0) return null;

  chips.sort((a, b) => b.valueUsd - a.valueUsd);
  const dayPnlPct = hasDailyDelta && prevTotalUsd > 0 ? dayPnlUsd / prevTotalUsd : null;
  const pnlSign = dayPnlUsd > 0 ? "+" : dayPnlUsd < 0 ? "-" : "";
  const pnlTone = dayPnlUsd > 0 ? "text-up" : dayPnlUsd < 0 ? "text-down" : "text-fg-muted";

  return (
    <section
      aria-label={isEn ? "Your crypto portfolio" : "Tu cartera cripto"}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface-1 p-4 sm:p-5"
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="label">{isEn ? "Your crypto portfolio" : "Tu cartera cripto"}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="num text-2xl leading-tight font-semibold tracking-tight tabular-nums text-fg">
              {formatTotalAmount(totalCryptoUsd, currency, rate)}
            </span>
            {currency === "CLP" && rate ? (
              <span className="text-xs font-medium text-fg-muted">CLP</span>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 sm:text-right">
          <p className="label">{isEn ? "24h result" : "Ganancia / pérdida del día"}</p>
          {hasDailyDelta ? (
            <p className={cn("num mt-1 text-sm leading-5 font-medium tabular-nums", pnlTone)}>
              {pnlSign}
              {formatTotalAmount(Math.abs(dayPnlUsd), currency, rate)}
              {dayPnlPct !== null ? ` (${formatPercent(dayPnlPct)})` : ""}
            </p>
          ) : (
            <p className="num mt-1 text-sm leading-5 text-fg-muted">—</p>
          )}
        </div>
      </div>

      <div className="no-scrollbar -mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 pt-1">
        {chips.map(({ asset, valueUsd }) => (
          <Link
            key={asset.symbol}
            href={`/app/cripto/${encodeURIComponent(asset.symbol)}`}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-fg focus-visible:outline-none"
          >
            <CryptoBadgeIcon symbol={asset.symbol} group={asset.group} sector={asset.sector} size={20} />
            <span className="font-mono font-semibold">{asset.symbol}</span>
            <span className="num tabular-nums text-fg-muted">{formatTotalAmount(valueUsd, currency, rate)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function FeaturedCryptoCard({
  asset,
  quote,
  pricesLoading,
  currency,
  rate,
}: {
  asset: CryptoAsset;
  quote: Quote | undefined;
  pricesLoading: boolean;
  currency: Currency;
  rate: number | undefined;
}) {
  const change = changePctOf(quote);
  const priceView = quote ? formatCryptoPrice(quote.priceUsd, currency, rate) : null;

  return (
    <Link
      href={`/app/cripto/${encodeURIComponent(asset.symbol)}`}
      className="group flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-border bg-bg p-4 transition-colors duration-150 hover:border-border-strong hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-fg focus-visible:outline-none"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <CryptoBadgeIcon symbol={asset.symbol} group={asset.group} sector={asset.sector} size={36} />
          <div className="min-w-0">
            <p className="truncate font-mono text-sm leading-5 font-semibold tracking-tight text-fg">
              {asset.symbol}
            </p>
            <p className="truncate text-xs leading-4 text-fg-muted" title={asset.name}>
              {asset.name}
            </p>
          </div>
        </div>
        {change !== null ? <ChangeBadge value={change} size="sm" className="shrink-0" /> : null}
      </div>

      <div className="flex min-w-0 items-baseline justify-between gap-2 border-t border-border/70 pt-2.5">
        <span className="min-w-0 truncate text-[11px] leading-4 text-fg-muted" title={asset.originLabel}>
          {asset.originLabel}
        </span>
        {priceView ? (
          <span className="num shrink-0 text-sm leading-5 font-semibold tracking-tight tabular-nums text-fg">
            {priceView.formatted}
            {priceView.shownCurrency === "CLP" ? (
              <span className="ml-1 text-[10px] font-medium text-fg-muted">CLP</span>
            ) : null}
          </span>
        ) : pricesLoading ? (
          <span aria-hidden className="h-4 w-16 shrink-0 rounded-sm bg-surface-2" />
        ) : (
          <span className="shrink-0 text-xs text-fg-muted">Sin precio</span>
        )}
      </div>
    </Link>
  );
}

function QuickBuyWidget({
  assets,
  prices,
  pricesLoading,
  currency,
  rate,
  isEn,
}: {
  assets: readonly CryptoAsset[];
  prices: ReadonlyMap<string, Quote>;
  pricesLoading: boolean;
  currency: Currency;
  rate: number | undefined;
  isEn: boolean;
}) {
  const router = useRouter();
  const amountInputId = useId();

  const selectableAssets = useMemo(() => {
    const bySymbol = new Map(assets.map((asset) => [asset.symbol.toUpperCase(), asset]));
    const list: CryptoAsset[] = [];
    for (const symbol of QUICK_BUY_CANDIDATES) {
      const found = bySymbol.get(symbol.toUpperCase());
      if (found) list.push(found);
    }
    return list.length > 0 ? list : assets.slice(0, 7);
  }, [assets]);

  const [pickedSymbol, setPickedSymbol] = useState<string>("BTC");
  const [amountRaw, setAmountRaw] = useState<string>("100");

  const selectedAsset =
    selectableAssets.find((asset) => asset.symbol.toUpperCase() === pickedSymbol.toUpperCase()) ??
    selectableAssets[0] ??
    null;

  if (!selectedAsset) return null;

  const quote = prices.get(selectedAsset.symbol.toLowerCase());
  const parsedAmount = parseAmount(amountRaw);
  const cap = selectedAsset.maxOrderUsd;
  const belowMin = parsedAmount > 0 && parsedAmount + 1e-9 < MIN_TRADE_USD;
  const overCap = parsedAmount > cap + 1e-9;
  const canContinue = parsedAmount >= MIN_TRADE_USD && !overCap;

  const estimatedTokens = quote && parsedAmount > 0 ? parsedAmount / quote.priceUsd : null;
  const selectedPriceView = quote ? formatCryptoPrice(quote.priceUsd, currency, rate) : null;
  const clpEquivalent =
    currency === "CLP" && rate && parsedAmount > 0 ? formatMoney(parsedAmount * rate, "CLP") : null;

  return (
    <Card className="flex min-w-0 flex-col gap-4 p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] leading-5 font-semibold tracking-tight text-fg">
            {isEn ? "Quick buy · Solana" : "Acceso rápido · Comprar en Solana"}
          </h2>
          <p className="mt-0.5 text-xs leading-4 text-fg-muted">
            {isEn
              ? "Calculate your swap and continue in the official ticket."
              : "Estima tu compra al instante y continúa en la boleta oficial."}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
            selectedAsset.seal === "AMARILLO" ? "bg-warn-bg text-warn" : "bg-up-bg text-up",
          )}
        >
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", selectedAsset.seal === "AMARILLO" ? "bg-warn" : "bg-up")}
          />
          {selectedAsset.seal === "AMARILLO" ? "Tope propio" : "Estándar"}
        </span>
      </div>

      {/* Selector rápido de moneda */}
      <div role="radiogroup" aria-label={isEn ? "Select coin" : "Elegir moneda"} className="flex flex-wrap gap-1.5">
        {selectableAssets.map((asset) => {
          const active = asset.symbol === selectedAsset.symbol;
          return (
            <button
              key={asset.symbol}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPickedSymbol(asset.symbol)}
              className={cn(
                "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-fg focus-visible:outline-none",
                active
                  ? "border-fg bg-fg text-bg"
                  : "border-border bg-bg text-fg-body hover:border-border-strong hover:bg-surface-2",
              )}
            >
              <CryptoBadgeIcon symbol={asset.symbol} group={asset.group} sector={asset.sector} size={18} />
              <span className="font-mono">{asset.symbol}</span>
            </button>
          );
        })}
      </div>

      {/* Monto en USD + botones rápidos */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={amountInputId} className="text-xs font-medium text-fg-muted">
            {isEn ? "Amount in USD" : "Monto en USD"}
          </label>
          {clpEquivalent ? (
            <span className="num text-xs tabular-nums text-fg-muted">≈ {clpEquivalent} CLP</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 rounded-md border border-control bg-bg px-3 focus-within:border-fg focus-within:ring-2 focus-within:ring-fg focus-within:ring-offset-2 focus-within:ring-offset-surface-1">
          <span aria-hidden className="font-mono text-sm font-medium text-fg-muted">
            US$
          </span>
          <input
            id={amountInputId}
            type="text"
            inputMode="decimal"
            value={amountRaw}
            onChange={(event) => setAmountRaw(event.target.value)}
            placeholder="100"
            data-bare-input="true"
            className="num min-h-11 w-full bg-transparent text-base font-medium text-fg tabular-nums outline-none placeholder:text-fg-muted"
          />
          <div className="flex shrink-0 items-center gap-1">
            {QUICK_AMOUNT_PRESETS.map((preset) => {
              const selected = Math.abs(parsedAmount - preset) < 1e-6;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setAmountRaw(String(preset))}
                  className={cn(
                    "inline-flex min-h-8 cursor-pointer items-center rounded-full px-2.5 font-mono text-xs font-medium tabular-nums transition-colors",
                    selected ? "bg-fg text-bg" : "bg-surface-2 text-fg-body hover:bg-surface-3",
                  )}
                >
                  ${preset}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Estimación viva con el precio actual */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-bg p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-fg-muted">{isEn ? "Estimated receive" : "Recibes aprox."}</span>
          {estimatedTokens !== null ? (
            <span className="num text-base font-semibold tracking-tight tabular-nums text-fg">
              {formatTokenQty(estimatedTokens)} {selectedAsset.symbol}
            </span>
          ) : pricesLoading ? (
            <span aria-hidden className="h-5 w-24 rounded-sm bg-surface-2" />
          ) : (
            <span className="text-xs font-medium text-fg-muted">
              {isEn ? "No live price available" : "Sin precio vivo disponible"}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-fg-muted">
          <span>
            {selectedPriceView
              ? `1 ${selectedAsset.symbol} ≈ ${selectedPriceView.formatted}${selectedPriceView.shownCurrency === "CLP" ? " CLP" : ""}`
              : pricesLoading
                ? isEn
                  ? "Checking live price…"
                  : "Consultando precio…"
                : isEn
                  ? "Live quote unavailable"
                  : "Cotización en vivo no disponible"}
          </span>
          <span className="num tabular-nums">
            {isEn ? "Max order" : "Tope"} {topeLabel(cap)}
          </span>
        </div>
      </div>

      {belowMin ? (
        <p role="status" className="text-xs leading-4 text-down">
          {isEn
            ? `Minimum order is ${formatMoney(MIN_TRADE_USD, "USD")}.`
            : `El monto mínimo por orden es ${formatMoney(MIN_TRADE_USD, "USD")}.`}
        </p>
      ) : overCap ? (
        <p role="status" className="text-xs leading-4 text-down">
          {isEn
            ? `Exceeds the ${topeLabel(cap)} limit for ${selectedAsset.symbol}.`
            : `Supera el tope de ${topeLabel(cap)} para ${selectedAsset.symbol}.`}
        </p>
      ) : null}

      <Button
        size="lg"
        className="w-full"
        disabled={!canContinue}
        onClick={() => {
          router.push(
            `/app/cripto/${encodeURIComponent(selectedAsset.symbol)}?monto=${encodeURIComponent(String(parsedAmount))}`,
          );
        }}
      >
        {isEn ? "Continue buy →" : "Continuar compra →"}
      </Button>
    </Card>
  );
}

function CryptoRow({
  asset,
  quote,
  pricesLoading,
  currency,
  rate,
  heldShares,
  isEn,
}: {
  asset: CryptoAsset;
  quote: Quote | undefined;
  pricesLoading: boolean;
  currency: Currency;
  rate: number | undefined;
  heldShares: number;
  isEn: boolean;
}) {
  const warning = asset.seal === "AMARILLO";
  const verificationLabel = warning ? "Tope propio" : "Estándar";
  const change = changePctOf(quote);
  const priceView = quote ? formatCryptoPrice(quote.priceUsd, currency, rate) : null;

  return (
    <li>
      <Link
        href={`/app/cripto/${encodeURIComponent(asset.symbol)}`}
        className={cn(
          "group flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-2 py-3 transition-colors duration-150 hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:ring-2 focus-visible:ring-fg focus-visible:outline-none focus-visible:ring-inset sm:grid sm:min-h-16 sm:flex-nowrap sm:gap-y-0",
          ROW_COLUMNS,
        )}
      >
        {/* 1. Activo */}
        <span className="flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
          <CryptoBadgeIcon symbol={asset.symbol} group={asset.group} sector={asset.sector} size={36} />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="truncate font-mono text-[13px] leading-5 font-semibold tracking-tight text-fg"
                title={asset.symbol}
              >
                {asset.symbol}
              </span>
              {heldShares > 0 ? (
                <span className="inline-flex shrink-0 items-center rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-fg-body ring-1 ring-border ring-inset">
                  {isEn ? "Held" : "En cartera"}
                </span>
              ) : null}
            </span>
            <span className="block truncate text-[13px] leading-5 text-fg-muted" title={`${asset.name} · ${asset.originLabel}`}>
              {asset.name} · {asset.originLabel}
            </span>
          </span>
        </span>

        {/* 2. Cambio 24h (desktop) */}
        <span className="hidden items-center sm:inline-flex">
          {change !== null ? (
            <ChangeBadge value={change} size="sm" />
          ) : pricesLoading ? (
            <span aria-hidden className="block h-5 w-14 rounded-full bg-surface-2" />
          ) : (
            <span className="num text-xs text-fg-muted">—</span>
          )}
        </span>

        {/* 3. Sello / Tope (desktop) */}
        <span className="hidden flex-col items-start text-xs leading-4 sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("size-1.5 shrink-0 rounded-full", warning ? "bg-warn" : "bg-up")}
            />
            <span className={warning ? "font-medium text-fg-body" : "text-fg-muted"}>
              <span className="sr-only">Sello {asset.seal}: </span>
              {verificationLabel}
            </span>
          </span>
          <span className="num mt-0.5 text-[11px] tabular-nums text-fg-muted">
            <span className="sr-only">Tope por orden </span>
            Tope {topeLabel(asset.maxOrderUsd)}
          </span>
        </span>

        {/* 4. Precio vivo */}
        <span className="ml-auto shrink-0 text-right sm:ml-0">
          {priceView !== null ? (
            <span className="num block text-sm font-medium tracking-tight tabular-nums text-fg">
              <span className="sr-only">Precio </span>
              {priceView.formatted}
              {priceView.shownCurrency === "CLP" ? (
                <span className="ml-1 text-[11px] font-medium text-fg-muted">CLP</span>
              ) : null}
            </span>
          ) : pricesLoading ? (
            <span aria-hidden className="ml-auto block h-4 w-20 rounded-sm bg-surface-2" />
          ) : (
            <span className="block text-[13px] leading-5 text-fg-muted">
              <span className="sr-only">Precio </span>
              Sin precio
            </span>
          )}
        </span>

        {/* 5. Acción (desktop) */}
        <span
          aria-hidden
          className="hidden shrink-0 items-center justify-end gap-1 text-xs font-medium text-fg-muted transition-colors duration-150 group-hover:text-fg sm:flex"
        >
          <span>{isEn ? "Buy" : "Comprar"}</span>
          <IconChevron className="size-4 -rotate-90 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none" />
        </span>

        {/* Móvil: cambio 24h, verificación/tope y acción */}
        <span className="flex w-full items-center justify-between gap-2 pl-12 text-xs leading-5 text-fg-muted sm:hidden">
          <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
            {change !== null ? <ChangeBadge value={change} size="sm" /> : null}
            <span
              aria-hidden
              className={cn("size-1.5 shrink-0 rounded-full", warning ? "bg-warn" : "bg-up")}
            />
            <span className={warning ? "font-medium text-fg-body" : undefined}>{verificationLabel}</span>
            <span aria-hidden>·</span>
            <span className="num tabular-nums">{topeLabel(asset.maxOrderUsd)}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-fg">
            {isEn ? "Buy" : "Comprar"}
            <IconChevron aria-hidden className="size-3.5 -rotate-90 text-fg-muted group-hover:text-fg" />
          </span>
        </span>
      </Link>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando el mercado cripto</span>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton key={key} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>

      <div aria-hidden className="flex items-center gap-2 overflow-hidden">
        {["Todas", "Principales", "Solana & DeFi", "IA", "Memes"].map((key) => (
          <Skeleton key={key} className="h-10 w-24 shrink-0 rounded-full" />
        ))}
      </div>

      <ul className="flex flex-col divide-y divide-border border-t border-border">
        {["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
          <li
            key={key}
            className={cn(
              "flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1.5 px-2 py-3 sm:grid sm:min-h-16 sm:flex-nowrap sm:gap-y-0",
              ROW_COLUMNS,
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-14" />
                <Skeleton className="h-3.5 w-32 max-w-full" />
              </div>
            </div>
            <Skeleton className="hidden h-5 w-14 rounded-full sm:block" />
            <Skeleton className="hidden h-4 w-20 sm:block" />
            <Skeleton className="ml-auto h-4 w-20 shrink-0 sm:ml-0" />
            <Skeleton className="hidden h-4 w-14 sm:ml-auto sm:block" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CryptoMarket({ sections }: { sections?: ReactNode }) {
  const { language, currency } = useT();
  const isEn = language === "en";
  const fx = useFx();
  const portfolioQuery = usePortfolio();

  const [filter, setFilter] = useState<CryptoFilterValue>("all");
  const [sort, setSort] = useState<CryptoSortValue>("featured");
  const [searchQuery, setSearchQuery] = useState("");
  const filterId = useId();
  const searchInputId = useId();
  const sortSelectId = useId();

  const listQuery = useQuery({
    queryKey: ["crypto-list"],
    queryFn: fetchCryptoList,
    staleTime: LIST_STALE_MS,
    gcTime: 30 * 60_000,
  });

  const assets = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const symbols = useMemo(() => assets.map((asset) => asset.symbol), [assets]);
  const pricesQuery = usePrices(symbols, assets.length > 0);
  const prices = useMemo(() => usablePrices(pricesQuery.data), [pricesQuery.data]);
  const pricesLoading = pricesQuery.isPending && symbols.length > 0;

  const fxRate =
    typeof fx.data?.rate === "number" && Number.isFinite(fx.data.rate) && fx.data.rate > 0
      ? fx.data.rate
      : undefined;
  const activeCurrency: Currency = currency === "CLP" && fxRate !== undefined ? "CLP" : "USD";

  const assetByLowerSymbol = useMemo(() => {
    const map = new Map<string, CryptoAsset>();
    for (const asset of assets) map.set(asset.symbol.toLowerCase(), asset);
    return map;
  }, [assets]);

  const heldSharesByLower = useMemo(() => {
    const map = new Map<string, number>();
    for (const position of portfolioQuery.data?.positions ?? []) {
      const lower = position.symbol.toLowerCase();
      if (!assetByLowerSymbol.has(lower) || !(position.shares > 0)) continue;
      map.set(lower, position.shares);
    }
    return map;
  }, [assetByLowerSymbol, portfolioQuery.data?.positions]);

  const hasPortfolioCrypto = heldSharesByLower.size > 0;
  const activeFilter: CryptoFilterValue = filter === "portfolio" && !hasPortfolioCrypto ? "all" : filter;

  const filterOptions = useMemo(() => {
    const base: { value: CryptoFilterValue; label: string }[] = SECTOR_OPTIONS.map((option) => ({
      value: option.value,
      label: isEn ? option.labelEn : option.labelEs,
    }));
    if (hasPortfolioCrypto) {
      base.push({ value: "portfolio", label: isEn ? "In your portfolio" : "En tu cartera" });
    }
    return base;
  }, [hasPortfolioCrypto, isEn]);

  const featuredAssets = useMemo(() => {
    const picked: CryptoAsset[] = [];
    const used = new Set<string>();
    for (const symbol of FEATURED_PRIORITY) {
      const found = assetByLowerSymbol.get(symbol.toLowerCase());
      if (found && !used.has(found.symbol)) {
        picked.push(found);
        used.add(found.symbol);
      }
      if (picked.length === 4) break;
    }
    for (const asset of assets) {
      if (picked.length === 4) break;
      if (!used.has(asset.symbol)) {
        picked.push(asset);
        used.add(asset.symbol);
      }
    }
    return picked;
  }, [assetByLowerSymbol, assets]);

  const topGainers = useMemo(() => {
    const candidates: { asset: CryptoAsset; quote: Quote; change: number }[] = [];
    for (const asset of assets) {
      const quote = prices.get(asset.symbol.toLowerCase());
      const change = changePctOf(quote);
      if (quote && change !== null && change > 0) {
        candidates.push({ asset, quote, change });
      }
    }
    candidates.sort((a, b) => b.change - a.change);
    return candidates.slice(0, 3);
  }, [assets, prices]);

  const filteredAndSortedAssets = useMemo(() => {
    const needle = fold(searchQuery.trim());
    const indexMap = new Map(assets.map((asset, index) => [asset.symbol, index]));

    const filtered = assets.filter((asset) => {
      if (activeFilter === "portfolio") {
        if (!heldSharesByLower.has(asset.symbol.toLowerCase())) return false;
      } else if (activeFilter !== "all" && asset.sector !== activeFilter) {
        return false;
      }

      if (!needle) return true;
      return [asset.symbol, asset.name, asset.originLabel].some((field) => fold(field).includes(needle));
    });

    if (sort === "featured") return filtered;

    return [...filtered].sort((a, b) => {
      const idxA = indexMap.get(a.symbol) ?? 0;
      const idxB = indexMap.get(b.symbol) ?? 0;
      const quoteA = prices.get(a.symbol.toLowerCase());
      const quoteB = prices.get(b.symbol.toLowerCase());

      if (sort === "gain" || sort === "loss") {
        const chA = changePctOf(quoteA);
        const chB = changePctOf(quoteB);
        if (chA === null && chB === null) return idxA - idxB;
        if (chA === null) return 1;
        if (chB === null) return -1;
        const cmp = sort === "gain" ? chB - chA : chA - chB;
        return cmp !== 0 ? cmp : idxA - idxB;
      }

      const prA = quoteA?.priceUsd ?? null;
      const prB = quoteB?.priceUsd ?? null;
      if (prA === null && prB === null) return idxA - idxB;
      if (prA === null) return 1;
      if (prB === null) return -1;
      const cmp = sort === "price-desc" ? prB - prA : prA - prB;
      return cmp !== 0 ? cmp : idxA - idxB;
    });
  }, [activeFilter, assets, heldSharesByLower, prices, searchQuery, sort]);

  // Frescura de los precios que la tabla realmente muestra.
  const freshestAt = useMemo(() => {
    let max: number | null = null;
    for (const quote of prices.values()) {
      const ms = Date.parse(quote.updatedAt);
      if (Number.isFinite(ms) && (max === null || ms > max)) max = ms;
    }
    if (max !== null) return max;
    return prices.size > 0 && pricesQuery.dataUpdatedAt > 0 ? pricesQuery.dataUpdatedAt : null;
  }, [prices, pricesQuery.dataUpdatedAt]);

  const anyStale = useMemo(() => {
    for (const quote of prices.values()) {
      if (quote.stale === true) return true;
    }
    return false;
  }, [prices]);

  const failed = listQuery.isError;
  const failure = listQuery.error;

  function moveFilter(key: string) {
    const currentIndex = Math.max(0, filterOptions.findIndex((option) => option.value === activeFilter));
    const nextIndex = indexFromKey(key, currentIndex, filterOptions.length);
    if (nextIndex === null) return;
    const next = filterOptions[nextIndex];
    if (!next) return;
    setFilter(next.value);
    document.getElementById(`${filterId}-${next.value}`)?.focus();
  }

  function retry() {
    void listQuery.refetch();
    if (symbols.length > 0) void pricesQuery.refetch();
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="sr-only">{isEn ? "Crypto" : "Cripto"}</h1>

      {sections ? <div className="-mx-5 min-w-0 px-5 sm:mx-0 sm:px-0">{sections}</div> : null}

      {/* a) Encabezado de subsección */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border pb-3">
        <CryptoSubTabs active="tokens" />
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-fg-muted">
          <span>Tokens en Solana</span>
          {!listQuery.isPending && !failed && assets.length > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span className="num font-medium tabular-nums text-fg-body">
                {assetCount(filteredAndSortedAssets.length, isEn)}
              </span>
            </>
          ) : null}
          {freshestAt !== null ? (
            <>
              <span aria-hidden>·</span>
              <PriceFreshness at={freshestAt} stale={anyStale} className="text-xs" />
            </>
          ) : null}
          <span
            aria-label={isEn ? `Display currency: ${activeCurrency}` : `Moneda visible: ${activeCurrency}`}
            className="inline-flex items-center rounded-full border border-border bg-surface-1 px-2 py-0.5 font-mono text-[11px] font-medium text-fg-body"
          >
            {activeCurrency}
          </span>
        </div>
      </div>

      {listQuery.isPending ? <ListSkeleton /> : null}

      {!listQuery.isPending && failed ? (
        <ErrorState
          title="No pudimos cargar la lista de criptos"
          description={failure instanceof Error && failure.message.trim() ? failure.message : undefined}
          onRetry={retry}
          retryLabel="Reintentar"
          label="Error al cargar"
        />
      ) : null}

      {!listQuery.isPending && !failed && assets.length === 0 ? (
        <EmptyState
          title="No hay criptos para mostrar"
          description="Vuelve a intentarlo en unos minutos."
          action={
            <Button variant="secondary" onClick={retry}>
              Reintentar
            </Button>
          }
        />
      ) : null}

      {!listQuery.isPending && !failed && assets.length > 0 ? (
        <>
          {/* b) Resumen "Tu cartera cripto" */}
          {portfolioQuery.data?.positions && hasPortfolioCrypto ? (
            <CryptoPortfolioSummary
              positions={portfolioQuery.data.positions}
              assetsByLower={assetByLowerSymbol}
              prices={prices}
              currency={activeCurrency}
              rate={fxRate}
              isEn={isEn}
            />
          ) : null}

          {/* c) Bloque superior (2 columnas en lg) */}
          <section
            aria-label={isEn ? "Featured and quick buy" : "Destacadas y acceso rápido"}
            className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start"
          >
            {/* Izquierda: Destacadas + Movers 24h + Puente a Ganar */}
            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-[15px] leading-5 font-semibold tracking-tight text-fg">
                    {isEn ? "Featured on Solana" : "Criptos destacadas"}
                  </h2>
                  <span className="text-xs text-fg-muted">{isEn ? "Trade 24/7" : "Opera 24/7"}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {featuredAssets.map((asset) => (
                    <FeaturedCryptoCard
                      key={asset.symbol}
                      asset={asset}
                      quote={prices.get(asset.symbol.toLowerCase())}
                      pricesLoading={pricesLoading}
                      currency={activeCurrency}
                      rate={fxRate}
                    />
                  ))}
                </div>
              </div>

              {/* Tira compacta de Mayores alzas 24h */}
              <div className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-surface-1 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="label">{isEn ? "Top 24h gainers" : "Mayores alzas 24h"}</h3>
                  <span className="text-[11px] text-fg-muted">Solana</span>
                </div>
                {topGainers.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {topGainers.map(({ asset, quote, change }) => {
                      const priceView = formatCryptoPrice(quote.priceUsd, activeCurrency, fxRate);
                      return (
                        <Link
                          key={asset.symbol}
                          href={`/app/cripto/${encodeURIComponent(asset.symbol)}`}
                          className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2 transition-colors hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-fg focus-visible:outline-none"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <CryptoBadgeIcon
                              symbol={asset.symbol}
                              group={asset.group}
                              sector={asset.sector}
                              size={24}
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-mono text-xs font-semibold text-fg">
                                {asset.symbol}
                              </span>
                              <span className="num block truncate text-[11px] tabular-nums text-fg-muted">
                                {priceView.formatted}
                              </span>
                            </span>
                          </span>
                          <ChangeBadge value={change} size="sm" className="shrink-0" />
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs leading-5 text-fg-muted">
                    {pricesLoading
                      ? isEn
                        ? "Checking 24h price movements…"
                        : "Consultando variaciones de las últimas 24 h…"
                      : isEn
                        ? "No positive 24h movers right now."
                        : "Sin alzas positivas registradas en las últimas 24 h."}
                  </p>
                )}
              </div>

              {/* Tarjeta puente hacia /app/ganar */}
              <Link
                href="/app/ganar"
                className="group flex min-w-0 items-center justify-between gap-4 rounded-xl border border-border bg-surface-1 px-4 py-3.5 transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-fg focus-visible:outline-none"
              >
                <div className="min-w-0">
                  <p className="text-sm leading-5 font-medium text-fg">
                    {isEn
                      ? "Holding SOL or dollars? Check APY yields in Earn →"
                      : "¿Tienes SOL o dólares? Revisa rendimientos APY en Ganar →"}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-fg-muted">
                    {isEn
                      ? "Liquid staking (JitoSOL, mSOL, bSOL) and USDY via Jupiter swaps."
                      : "Staking líquido (JitoSOL, mSOL, bSOL) y USDY mediante swaps en Jupiter."}
                  </p>
                </div>
                <IconChevron
                  aria-hidden
                  className="size-4 shrink-0 -rotate-90 text-fg-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-fg"
                />
              </Link>
            </div>

            {/* Derecha: Compra rápida cripto */}
            <QuickBuyWidget
              assets={assets}
              prices={prices}
              pricesLoading={pricesLoading}
              currency={activeCurrency}
              rate={fxRate}
              isEn={isEn}
            />
          </section>

          {/* d) Buscador, filtros por sector y ordenamiento + e) Tabla enriquecida */}
          <section aria-label="Listado de criptos" className="flex min-w-0 flex-col gap-5 border-t border-border pt-6">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Buscador */}
              <div className="relative min-w-0 flex-1 sm:max-w-md">
                <label htmlFor={searchInputId} className="sr-only">
                  {isEn ? "Search crypto, dollars or gold" : "Buscar cripto, dólar u oro"}
                </label>
                <IconSearch
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-muted"
                />
                <input
                  id={searchInputId}
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={
                    isEn
                      ? "Search crypto, dollar or gold (BTC, Solana, Jupiter...)"
                      : "Buscar cripto, dólar u oro (BTC, Solana, Jupiter...)"
                  }
                  className="min-h-11 w-full rounded-full border border-control bg-surface-1 pr-10 pl-10 text-sm text-fg transition duration-[140ms] ease-spring placeholder:text-fg-muted hover:border-fg/50 focus-visible:border-fg focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
                />
                {searchQuery.length > 0 ? (
                  <button
                    type="button"
                    aria-label={isEn ? "Clear search" : "Limpiar búsqueda"}
                    onClick={() => setSearchQuery("")}
                    className="absolute top-1/2 right-1.5 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-fg focus-visible:outline-none"
                  >
                    <IconClose className="size-3.5" />
                  </button>
                ) : null}
              </div>

              {/* Ordenamiento */}
              <div className="flex shrink-0 items-center gap-2">
                <label htmlFor={sortSelectId} className="text-xs font-medium whitespace-nowrap text-fg-muted">
                  {isEn ? "Sort" : "Ordenar"}
                </label>
                <select
                  id={sortSelectId}
                  value={sort}
                  onChange={(event) => setSort(event.target.value as CryptoSortValue)}
                  className="min-h-11 rounded-full border border-control bg-surface-1 px-3.5 text-sm font-medium text-fg transition duration-[140ms] hover:border-fg/50 focus-visible:border-fg focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:outline-none sm:min-h-10"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {isEn ? option.labelEn : option.labelEs}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Chips de sector */}
            <div className="no-scrollbar -mx-5 flex min-w-0 overflow-x-auto overscroll-x-contain px-5 sm:mx-0 sm:px-0">
              <div
                role="radiogroup"
                aria-label={isEn ? "Asset sector" : "Sector de activos"}
                className="inline-flex min-w-0 shrink-0 items-center gap-2"
                onKeyDown={(event) => {
                  if (indexFromKey(event.key, 0, filterOptions.length) === null) return;
                  event.preventDefault();
                  moveFilter(event.key);
                }}
              >
                {filterOptions.map((option) => {
                  const selected = activeFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      id={`${filterId}-${option.value}`}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setFilter(option.value)}
                      className={cn(
                        "inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border px-3.5 text-[13px] leading-5 font-medium whitespace-nowrap transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-fg focus-visible:outline-none sm:min-h-10",
                        selected
                          ? "border-fg bg-fg text-bg"
                          : "border-border bg-bg text-fg-muted hover:border-border-strong hover:text-fg",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {pricesQuery.isError ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[13px] leading-5 text-fg-muted">
                  No pudimos actualizar los precios. Las filas sin cotización muestran «Sin precio».
                </p>
                <Button variant="secondary" size="sm" onClick={retry}>
                  Reintentar
                </Button>
              </div>
            ) : null}

            {filteredAndSortedAssets.length === 0 ? (
              <EmptyState
                title={isEn ? "No matching tokens" : "No encontramos activos con ese criterio"}
                description={
                  isEn
                    ? "Try clearing your search or selecting another sector."
                    : "Prueba limpiando el buscador o seleccionando otro sector."
                }
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setFilter("all");
                      setSearchQuery("");
                      setSort("featured");
                    }}
                  >
                    {isEn ? "Show all" : "Ver todas"}
                  </Button>
                }
              />
            ) : (
              <div className="flex min-w-0 flex-col">
                <div
                  aria-hidden
                  className={cn(
                    "hidden items-center gap-x-3 border-b border-border px-2 pb-2 font-mono text-[11px] font-medium tracking-[0.06em] text-fg-muted uppercase sm:grid",
                    ROW_COLUMNS,
                  )}
                >
                  <span>{isEn ? "Asset" : "Activo"}</span>
                  <span>{isEn ? "24h" : "Cambio 24h"}</span>
                  <span>{isEn ? "Seal / Limit" : "Sello / Tope"}</span>
                  <span className="text-right">{isEn ? "Live price" : "Precio vivo"}</span>
                  <span className="text-right">{isEn ? "Action" : "Acción"}</span>
                </div>

                <ul className="flex min-w-0 flex-col divide-y divide-border border-t border-border sm:border-t-0">
                  {filteredAndSortedAssets.map((asset) => (
                    <CryptoRow
                      key={asset.symbol}
                      asset={asset}
                      quote={prices.get(asset.symbol.toLowerCase())}
                      pricesLoading={pricesLoading}
                      currency={activeCurrency}
                      rate={fxRate}
                      heldShares={heldSharesByLower.get(asset.symbol.toLowerCase()) ?? 0}
                      isEn={isEn}
                    />
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      ) : null}

      <footer
        aria-label="Notas y avisos legales"
        className="flex flex-col gap-1.5 border-t border-border pt-6 text-xs leading-relaxed text-fg-muted"
      >
        <p>
          {NON_CUSTODY_LINE} {LEGAL_REVIEW_NOTICE}
        </p>
        <p>{BRIDGED_TOKEN_NOTICE}</p>
        <p>
          Tokens de Solana, no son acciones xStocks. Sello VERDE («Estándar»): tope estándar por orden; sello
          AMARILLO («Tope propio»): tope propio del token indicado en cada fila.
        </p>
      </footer>
    </div>
  );
}

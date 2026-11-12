"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { PriceFreshness } from "@/components/domain/price-freshness";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { BRIDGED_TOKEN_NOTICE, LEGAL_REVIEW_NOTICE, NON_CUSTODY_LINE } from "@/content/crypto-legal";
import { apiResultSchema } from "@/lib/api/contracts";
import type { CryptoAsset } from "@/lib/catalog/crypto-types";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { usePrices } from "@/lib/hooks/queries";
import type { Quote } from "@/lib/types";

/** La lista cambia poco: se refresca al volver a entrar, no en cada tick. */
const LIST_STALE_MS = 5 * 60_000;

/** Retícula de la tabla: activo · sello · tope · precio. Sólo desde sm. */
const ROW_COLUMNS = "sm:grid-cols-[minmax(0,1fr)_5rem_6.5rem_8rem]";

/** Grupos del catálogo, en el orden en que se leen. */
const GROUPS = [
  { key: "crypto", id: "grupo-cripto", title: "Cripto", note: "Tokens de Solana." },
  { key: "dollar", id: "grupo-dolar", title: "Dólar", note: "Dólares tokenizados." },
  { key: "gold", id: "grupo-oro", title: "Oro", note: "Oro tokenizado en Solana." },
] as const satisfies readonly {
  key: CryptoAsset["group"];
  id: string;
  title: string;
  note: string;
}[];

/**
 * Contrato de `GET /api/crypto/list` (A1). Se valida en el borde para no
 * pintar una fila con un sello o un grupo que la UI no sepa mostrar.
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
      originLabel: z.string().min(1),
      maxOrderUsd: z.number().positive(),
    }),
  ),
});

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

  // Las rutas del proyecto responden `{ ok, data }`; se acepta también la
  // lista directa para no romper si el endpoint público la sirve sin sobre.
  const envelope = apiResultSchema(cryptoListSchema).safeParse(payload);
  if (envelope.success) {
    if (envelope.data.ok) return envelope.data.data.items;
    throw new Error(envelope.data.error.message);
  }
  const direct = cryptoListSchema.safeParse(payload);
  if (direct.success) return direct.data.items;
  throw new Error("La lista de criptos no tiene el formato esperado.");
}

const usd4 = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const usd6 = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

const usd8 = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
});

const usdTope = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Dos decimales desde US$ 1; más precisión sólo cuando el token vale menos. */
function priceLabel(value: number): string {
  if (value >= 1) return formatMoney(value, "USD");
  if (value >= 0.01) return usd4.format(value);
  if (value >= 0.0001) return usd6.format(value);
  return usd8.format(value);
}

/** Tope por orden, sin centavos. */
function topeLabel(value: number): string {
  return usdTope.format(value);
}

/** Conteo real, con singular honesto. */
function assetCount(value: number): string {
  return `${value} ${value === 1 ? "activo" : "activos"}`;
}

/** Precio vivo únicamente: fuera las anclas de acciones y los valores mock. */
function usablePrices(quotes: readonly Quote[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const quote of quotes ?? []) {
    if (quote.source !== "jupiter") continue;
    if (quote.reference === true) continue;
    if (!Number.isFinite(quote.priceUsd) || quote.priceUsd <= 0) continue;
    map.set(quote.symbol.toLowerCase(), quote.priceUsd);
  }
  return map;
}

function monogramLetters(symbol: string): string {
  const letters = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (letters.length > 0 ? letters : symbol).slice(0, 2);
}

/** Monograma local: iniciales del símbolo, sin pedir imágenes a terceros. */
function CryptoMonogram({ symbol }: { symbol: string }) {
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[13px] leading-none font-medium text-fg-body select-none"
    >
      {monogramLetters(symbol)}
    </span>
  );
}

function CryptoRow({
  asset,
  priceUsd,
  pricesLoading,
}: {
  asset: CryptoAsset;
  priceUsd: number | null;
  pricesLoading: boolean;
}) {
  const warning = asset.seal === "AMARILLO";

  return (
    <li>
      <Link
        href={`/app/cripto/${encodeURIComponent(asset.symbol)}`}
        className={cn(
          "flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2.5 transition-colors duration-150 hover:bg-surface-1 sm:grid sm:min-h-16 sm:flex-nowrap sm:gap-y-0 sm:py-3",
          ROW_COLUMNS,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
          <CryptoMonogram symbol={asset.symbol} />
          <span className="min-w-0 flex-1">
            <span
              className="block truncate font-mono text-[13px] leading-5 font-semibold tracking-tight text-fg"
              title={asset.symbol}
            >
              {asset.symbol}
            </span>
            <span className="block truncate text-[13px] leading-5 text-fg-muted" title={asset.name}>
              {asset.name}
            </span>
          </span>
        </span>

        <span
          className={cn(
            "hidden text-[13px] leading-5 sm:block",
            warning ? "font-medium text-warn" : "text-fg-muted",
          )}
        >
          <span className="sr-only">Sello </span>
          {asset.seal}
        </span>
        <span className="num hidden text-right text-[13px] leading-5 tabular-nums text-fg-muted sm:block">
          <span className="sr-only">Tope por orden </span>
          {topeLabel(asset.maxOrderUsd)}
        </span>

        <span className="shrink-0 text-right">
          {priceUsd !== null ? (
            <span className="num block text-sm font-medium tracking-tight tabular-nums text-fg">
              <span className="sr-only">Precio </span>
              {priceLabel(priceUsd)}
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

        {/* Móvil: sello y tope como dato, sin cápsulas. */}
        <span className="w-full pl-12 text-[13px] leading-5 text-fg-subtle sm:hidden">
          Sello <span className={warning ? "font-medium text-warn" : undefined}>{asset.seal}</span>
          <span aria-hidden> · </span>
          Tope <span className="num tabular-nums">{topeLabel(asset.maxOrderUsd)}</span>
        </span>
      </Link>
    </li>
  );
}

function AssetGroup({
  id,
  title,
  note,
  assets,
  prices,
  pricesLoading,
}: {
  id: string;
  title: string;
  note: string;
  assets: readonly CryptoAsset[];
  prices: ReadonlyMap<string, number>;
  pricesLoading: boolean;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex min-w-0 scroll-mt-24 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <h2 id={`${id}-title`} className="text-lg leading-tight font-medium tracking-tight text-fg">
            {title}
          </h2>
          <p className="text-[13px] leading-5 text-fg-muted">{note}</p>
        </div>
        <p className="num shrink-0 pr-2 text-[13px] leading-5 tabular-nums text-fg-muted">{assetCount(assets.length)}</p>
      </div>

      <div className="flex min-w-0 flex-col">
        <div
          aria-hidden
          className={cn("hidden items-baseline gap-x-3 border-b border-border px-2 pb-2 sm:grid", ROW_COLUMNS)}
        >
          <span className="eyebrow">Activo</span>
          <span className="eyebrow">Sello</span>
          <span className="eyebrow text-right">Tope por orden</span>
          <span className="eyebrow text-right">Precio</span>
        </div>

        <ul className="flex min-w-0 flex-col divide-y divide-border border-t border-border sm:border-t-0">
          {assets.map((asset) => (
            <CryptoRow
              key={asset.symbol}
              asset={asset}
              priceUsd={prices.get(asset.symbol.toLowerCase()) ?? null}
              pricesLoading={pricesLoading}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-10">
      <span className="sr-only">Cargando la lista de criptos</span>
      <div aria-hidden className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-28" />
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <div className="flex min-h-5 items-center">
            <Skeleton className="h-4 w-24" />
          </div>
          {["Cripto", "Dólar", "Oro"].map((key) => (
            <div key={key} className="flex min-h-11 items-center">
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>

        <Skeleton className="h-4 w-80 max-w-full" />

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="flex flex-col">
            <div
              className={cn("hidden items-center gap-x-3 border-b border-border px-2 pb-2 sm:grid", ROW_COLUMNS)}
            >
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-14" />
              <Skeleton className="ml-auto h-4 w-12" />
              <Skeleton className="ml-auto h-4 w-14" />
            </div>
            <ul className="flex flex-col divide-y divide-border border-t border-border sm:border-t-0">
              {["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
                <li
                  key={key}
                  className={cn(
                    "flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2.5 sm:grid sm:min-h-16 sm:flex-nowrap sm:gap-y-0 sm:py-3",
                    ROW_COLUMNS,
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
                    <Skeleton className="size-9 shrink-0 rounded-full" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-12" />
                      <Skeleton className="h-3.5 w-24 max-w-full" />
                    </div>
                  </div>
                  <Skeleton className="hidden h-4 w-14 sm:block" />
                  <Skeleton className="ml-auto hidden h-4 w-16 sm:block" />
                  <Skeleton className="ml-auto h-4 w-20 shrink-0 sm:ml-0" />
                  <div className="w-full pl-12 sm:hidden">
                    <Skeleton className="h-3 w-40 max-w-full" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Avisos que no caben arriba: al pie, en el mismo cuerpo que la prosa. */
function BridgedNotice() {
  return (
    <section aria-label="Aviso de token puenteado" className="border-t border-border pt-4">
      <p className="max-w-prose text-[13px] leading-relaxed text-fg-body">{BRIDGED_TOKEN_NOTICE}</p>
    </section>
  );
}

export function CryptoMarket() {
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

  const groups = useMemo(() => {
    const buckets: Record<CryptoAsset["group"], CryptoAsset[]> = {
      crypto: [],
      dollar: [],
      gold: [],
    };
    for (const asset of assets) buckets[asset.group].push(asset);
    return GROUPS.map((group) => ({ ...group, assets: buckets[group.key] })).filter(
      (group) => group.assets.length > 0,
    );
  }, [assets]);

  // Frescura de los precios que la tabla realmente muestra: el `updatedAt` más
  // reciente de esas cotizaciones; si no viene, la hora del lote.
  const freshestAt = useMemo(() => {
    let max: number | null = null;
    for (const quote of pricesQuery.data ?? []) {
      if (quote.source !== "jupiter" || quote.reference === true) continue;
      if (!prices.has(quote.symbol.toLowerCase())) continue;
      const ms = Date.parse(quote.updatedAt);
      if (Number.isFinite(ms) && (max === null || ms > max)) max = ms;
    }
    if (max !== null) return max;
    return prices.size > 0 && pricesQuery.dataUpdatedAt > 0 ? pricesQuery.dataUpdatedAt : null;
  }, [prices, pricesQuery.data, pricesQuery.dataUpdatedAt]);
  const anyStale = (pricesQuery.data ?? []).some(
    (quote) => prices.has(quote.symbol.toLowerCase()) && quote.stale === true,
  );

  const failed = listQuery.isError;
  const failure = listQuery.error;

  function retry() {
    void listQuery.refetch();
    if (symbols.length > 0) void pricesQuery.refetch();
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Cripto"
        description="Cripto, dólares y oro tokenizados que viven en Solana. Precio de mercado en vivo; si falta la cotización, verás «Sin precio»."
      />

      {/* Los dos avisos que no se pueden perder de vista; el resto queda al pie. */}
      <section
        aria-label="Avisos de custodia y revisión legal"
        className="flex flex-col gap-1 border-y border-border py-3 text-[13px] leading-relaxed text-fg-body"
      >
        <p>{NON_CUSTODY_LINE}</p>
        <p>{LEGAL_REVIEW_NOTICE}</p>
      </section>

      <p className="text-[13px] leading-5 font-medium text-fg-body">Tokens de Solana · no son acciones xStocks</p>

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
        <section aria-label="Listado de criptos" className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border pb-3">
            <p className="text-[13px] leading-5 text-fg-muted">
              <span className="num font-medium tabular-nums text-fg-body">{assets.length}</span>{" "}
              {assets.length === 1 ? "activo" : "activos"} · Precio de mercado en vivo
            </p>
            <PriceFreshness at={freshestAt} stale={anyStale} className="text-[13px]" />
          </div>

          <nav aria-label="Secciones de cripto" className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="eyebrow">En esta página</span>
            {groups.map((group) => (
              <a
                key={group.id}
                href={`#${group.id}`}
                className="inline-flex min-h-11 items-center text-[13px] leading-5 font-medium text-fg-body underline decoration-border underline-offset-4 transition-colors hover:text-fg hover:decoration-fg motion-reduce:transition-none"
              >
                {group.title}
              </a>
            ))}
          </nav>

          <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">
            Sello VERDE: tope estándar por orden. Sello AMARILLO: tope propio del token, indicado en cada fila.
          </p>

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

          <div className="flex min-w-0 flex-col gap-10">
            {groups.map((group) => (
              <AssetGroup
                key={group.id}
                id={group.id}
                title={group.title}
                note={group.note}
                assets={group.assets}
                prices={prices}
                pricesLoading={pricesLoading}
              />
            ))}
          </div>
        </section>
      ) : null}

      <BridgedNotice />
    </div>
  );
}

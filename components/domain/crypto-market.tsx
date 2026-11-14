"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { CryptoSubTabs } from "@/components/domain/market-section-chips";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { IconChevron } from "@/components/ui/icons";
import { indexFromKey } from "@/components/ui/keys";
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

/** Retícula de la tabla: activo · verificación · tope · precio · acción. Sólo desde sm. */
const ROW_COLUMNS = "sm:grid-cols-[minmax(0,1fr)_8.25rem_6.5rem_7.5rem_1.25rem]";

type CryptoCategoryFilter = "all" | CryptoAsset["group"];

const CATEGORY_FILTERS: readonly { value: CryptoCategoryFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "crypto", label: "Cripto" },
  { value: "dollar", label: "Dólar" },
  { value: "gold", label: "Oro" },
];

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
  const verificationLabel = warning ? "Tope propio" : "Estándar";

  return (
    <li>
      <Link
        href={`/app/cripto/${encodeURIComponent(asset.symbol)}`}
        className={cn(
          "group flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1.5 px-2 py-3 transition-colors duration-150 hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:ring-2 focus-visible:ring-fg focus-visible:outline-none focus-visible:ring-inset sm:grid sm:min-h-16 sm:flex-nowrap sm:gap-y-0",
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

        <span className="hidden items-center gap-2 text-[13px] leading-5 sm:inline-flex">
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", warning ? "bg-warn" : "bg-up")}
          />
          <span className={warning ? "font-medium text-fg-body" : "text-fg-muted"}>
            <span className="sr-only">Sello {asset.seal}: </span>
            {verificationLabel}
          </span>
        </span>

        <span className="num hidden text-right text-[13px] leading-5 tabular-nums text-fg-muted sm:block">
          <span className="sr-only">Tope por orden </span>
          {topeLabel(asset.maxOrderUsd)}
        </span>

        <span className="ml-auto shrink-0 text-right sm:ml-0">
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

        <span
          aria-hidden
          className="hidden shrink-0 items-center justify-end text-fg-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-fg motion-reduce:transform-none sm:flex"
        >
          <IconChevron className="size-4 -rotate-90" />
        </span>

        {/* Móvil: estado de verificación, tope por orden y chevron compacto bajo el activo. */}
        <span className="flex w-full items-center justify-between gap-2 pl-12 text-xs leading-5 text-fg-muted sm:hidden">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className={cn("size-1.5 shrink-0 rounded-full", warning ? "bg-warn" : "bg-up")}
            />
            <span className={warning ? "font-medium text-fg-body" : undefined}>{verificationLabel}</span>
            <span aria-hidden>·</span>
            <span>
              Tope <span className="num tabular-nums">{topeLabel(asset.maxOrderUsd)}</span>
            </span>
          </span>
          <IconChevron
            aria-hidden
            className="size-3.5 shrink-0 -rotate-90 text-fg-muted transition-colors group-hover:text-fg"
          />
        </span>
      </Link>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Cargando la lista de criptos</span>

      <div aria-hidden className="flex items-center gap-2 overflow-hidden">
        {["Todas", "Cripto", "Dólar", "Oro"].map((key) => (
          <Skeleton key={key} className="h-11 w-20 shrink-0 rounded-full sm:h-10" />
        ))}
      </div>

      <div aria-hidden className="flex flex-col">
        <div
          className={cn("hidden items-center gap-x-3 border-b border-border px-2 pb-2 sm:grid", ROW_COLUMNS)}
        >
          <Skeleton className="h-3.5 w-12" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="ml-auto h-3.5 w-16" />
          <Skeleton className="ml-auto h-3.5 w-12" />
          <span />
        </div>

        <ul className="flex flex-col divide-y divide-border border-t border-border sm:border-t-0">
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
                  <Skeleton className="h-3.5 w-12" />
                  <Skeleton className="h-3.5 w-24 max-w-full" />
                </div>
              </div>
              <Skeleton className="hidden h-4 w-20 sm:block" />
              <Skeleton className="ml-auto hidden h-4 w-16 sm:block" />
              <Skeleton className="ml-auto h-4 w-20 shrink-0 sm:ml-0" />
              <span className="hidden sm:block" />
              <div className="w-full pl-12 sm:hidden">
                <Skeleton className="h-3 w-40 max-w-full" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CryptoMarket({ sections }: { sections?: ReactNode }) {
  const [filter, setFilter] = useState<CryptoCategoryFilter>("all");
  const filterId = useId();

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

  const filteredAssets = useMemo(() => {
    if (filter === "all") return assets;
    return assets.filter((asset) => asset.group === filter);
  }, [assets, filter]);

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

  function moveFilter(key: string) {
    const currentIndex = Math.max(0, CATEGORY_FILTERS.findIndex((option) => option.value === filter));
    const nextIndex = indexFromKey(key, currentIndex, CATEGORY_FILTERS.length);
    if (nextIndex === null) return;
    const next = CATEGORY_FILTERS[nextIndex];
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
      <h1 className="sr-only">Cripto</h1>

      {sections ? <div className="-mx-5 min-w-0 px-5 sm:mx-0 sm:px-0">{sections}</div> : null}

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border pb-3">
        <CryptoSubTabs active="tokens" />
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-fg-muted">
          <span>Tokens en Solana</span>
          {!listQuery.isPending && !failed && assets.length > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span className="num font-medium tabular-nums text-fg-body">
                {assetCount(filteredAssets.length)}
              </span>
            </>
          ) : null}
          {freshestAt !== null ? (
            <>
              <span aria-hidden>·</span>
              <PriceFreshness at={freshestAt} stale={anyStale} className="text-xs" />
            </>
          ) : null}
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
        <section aria-label="Listado de criptos" className="flex min-w-0 flex-col gap-5">
          <div className="no-scrollbar -mx-5 flex min-w-0 overflow-x-auto overscroll-x-contain px-5 sm:mx-0 sm:px-0">
            <div
              role="radiogroup"
              aria-label="Categoría de activos"
              className="inline-flex min-w-0 shrink-0 items-center gap-2"
              onKeyDown={(event) => {
                if (indexFromKey(event.key, 0, CATEGORY_FILTERS.length) === null) return;
                event.preventDefault();
                moveFilter(event.key);
              }}
            >
              {CATEGORY_FILTERS.map((option) => {
                const selected = filter === option.value;
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
                        ? "border-fg bg-surface-1 text-fg"
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

          {filteredAssets.length === 0 ? (
            <EmptyState
              title="No hay activos en esta categoría"
              description="Prueba seleccionando otra categoría."
              action={
                <Button variant="secondary" size="sm" onClick={() => setFilter("all")}>
                  Ver todas
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
                <span>Activo</span>
                <span>Verificación</span>
                <span className="text-right">Tope / orden</span>
                <span className="text-right">Precio</span>
                <span />
              </div>

              <ul className="flex min-w-0 flex-col divide-y divide-border border-t border-border sm:border-t-0">
                {filteredAssets.map((asset) => (
                  <CryptoRow
                    key={asset.symbol}
                    asset={asset}
                    priceUsd={prices.get(asset.symbol.toLowerCase()) ?? null}
                    pricesLoading={pricesLoading}
                  />
                ))}
              </ul>
            </div>
          )}
        </section>
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

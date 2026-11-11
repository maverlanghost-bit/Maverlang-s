"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

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

/**
 * Tonos neutros: el sello ya no usa el verde de «sube», así que el monograma
 * sigue siendo el único bloque de color de la fila.
 */
const MONOGRAM_TONES = ["bg-surface-2", "bg-surface-3"] as const;

function monogramLetters(symbol: string): string {
  const letters = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (letters.length > 0 ? letters : symbol).slice(0, 2);
}

/** El mismo símbolo cae siempre en el mismo tono, como en TickerLogo. */
function monogramTone(symbol: string): string {
  let hash = 2166136261;
  for (const char of symbol) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return MONOGRAM_TONES[(hash >>> 0) % MONOGRAM_TONES.length] ?? MONOGRAM_TONES[0];
}

/** Monograma local: iniciales del símbolo, sin pedir imágenes a terceros. */
function CryptoMonogram({ symbol }: { symbol: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full border border-border font-mono text-xs leading-none font-medium text-fg select-none",
        monogramTone(symbol),
      )}
    >
      {monogramLetters(symbol)}
    </span>
  );
}

/**
 * Sello del catálogo. Neutro por defecto: el color queda reservado para el
 * precio (sube/baja) y el ámbar sólo marca el tope más estricto (AMARILLO).
 */
function SealChip({ seal }: { seal: CryptoAsset["seal"] }) {
  const warning = seal === "AMARILLO";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs leading-none font-medium whitespace-nowrap",
        warning ? "bg-warn-bg text-warn" : "border border-border bg-bg text-fg-muted",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", warning ? "bg-warn" : "bg-fg-muted")}
      />
      Sello {seal}
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
  return (
    <li>
      <Link
        href={`/app/cripto/${encodeURIComponent(asset.symbol)}`}
        className="flex min-h-16 items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors duration-150 hover:bg-surface-2/70 sm:px-3"
      >
        <CryptoMonogram symbol={asset.symbol} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="truncate font-semibold tracking-tight text-fg">{asset.symbol}</span>
            <SealChip seal={asset.seal} />
          </span>
          {/* En móvil la fila se queda en dos líneas; el origen se ve en la ficha. */}
          <span className="mt-0.5 block truncate text-sm text-fg-body" title={asset.name}>
            {asset.name}
          </span>
          <span className="mt-0.5 hidden truncate text-xs text-fg-muted sm:block" title={asset.originLabel}>
            {asset.originLabel}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          {priceUsd !== null ? (
            <span className="num text-sm font-medium tabular-nums text-fg">{priceLabel(priceUsd)}</span>
          ) : pricesLoading ? (
            <span aria-hidden className="block h-5 w-16 rounded-md bg-surface-2" />
          ) : (
            <span className="text-sm font-medium text-fg-muted">Sin precio</span>
          )}
          {asset.seal === "AMARILLO" ? (
            <span className="num text-xs tabular-nums text-warn">Tope {topeLabel(asset.maxOrderUsd)}</span>
          ) : null}
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
    <section id={id} aria-labelledby={`${id}-title`} className="flex min-w-0 scroll-mt-24 flex-col gap-2">
      <div>
        <h2 id={`${id}-title`} className="text-lg font-medium tracking-tight text-fg">
          {title}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">{note}</p>
      </div>
      <ul className="flex min-w-0 flex-col divide-y divide-border rounded-3xl bg-surface-1 p-2 shadow-card">
        {assets.map((asset) => (
          <CryptoRow
            key={asset.symbol}
            asset={asset}
            priceUsd={prices.get(asset.symbol.toLowerCase()) ?? null}
            pricesLoading={pricesLoading}
          />
        ))}
      </ul>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando la lista de criptos</span>
      <div aria-hidden className="flex flex-col gap-2">
        <Skeleton className="h-6 w-32" />
        <div className="flex flex-col gap-1.5 rounded-3xl bg-surface-1 p-2 shadow-card">
          {["a", "b", "c", "d", "e", "f"].map((key) => (
            <div key={key} className="flex min-h-16 items-center gap-3 px-2">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-40 max-w-full" />
              </div>
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Avisos que no caben arriba: al pie, en el mismo cuerpo que la prosa. */
function BridgedNotice() {
  return (
    <section
      aria-label="Avisos legales"
      className="border-t border-border pt-4 text-sm leading-relaxed text-fg-body"
    >
      <p>{BRIDGED_TOKEN_NOTICE}</p>
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
    const crypto: CryptoAsset[] = [];
    const stableAndGold: CryptoAsset[] = [];
    for (const asset of assets) {
      if (asset.group === "crypto") crypto.push(asset);
      else stableAndGold.push(asset);
    }
    return { crypto, stableAndGold };
  }, [assets]);

  const failed = listQuery.isError;
  const failure = listQuery.error;

  function retry() {
    void listQuery.refetch();
    if (symbols.length > 0) void pricesQuery.refetch();
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Cripto"
        description="Cripto, dólares y oro tokenizados que viven en Solana. Precio de mercado en vivo; si falta la cotización, verás «Sin precio»."
      />

      {/* Los dos avisos que no se pueden perder de vista; el resto queda al pie. */}
      <div className="rounded-2xl bg-surface-1 px-4 py-3 text-sm leading-relaxed text-fg-body">
        <p>{NON_CUSTODY_LINE}</p>
        <p className="mt-1">{LEGAL_REVIEW_NOTICE}</p>
      </div>

      <p className="text-sm font-medium text-fg-body">Tokens de Solana · no son acciones xStocks</p>

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
          <nav aria-label="Secciones de cripto" className="flex flex-wrap items-center gap-x-5">
            <span className="eyebrow">En esta página</span>
            <a
              href="#grupo-cripto"
              className="inline-flex min-h-11 items-center text-sm font-medium text-fg-body underline decoration-border underline-offset-4 transition-colors hover:text-fg hover:decoration-fg motion-reduce:transition-none"
            >
              Cripto
            </a>
            <a
              href="#grupo-dolares-oro"
              className="inline-flex min-h-11 items-center text-sm font-medium text-fg-body underline decoration-border underline-offset-4 transition-colors hover:text-fg hover:decoration-fg motion-reduce:transition-none"
            >
              Dólares y oro
            </a>
          </nav>

          <p className="text-sm leading-relaxed text-fg-muted">
            Sello VERDE: tope estándar por orden. Sello AMARILLO: tope propio del token, indicado en cada fila.
          </p>

          {pricesQuery.isError ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-fg-muted">
                No pudimos actualizar los precios. Las filas sin cotización muestran «Sin precio».
              </p>
              <Button variant="secondary" size="sm" onClick={retry}>
                Reintentar
              </Button>
            </div>
          ) : null}

          {groups.crypto.length > 0 ? (
            <AssetGroup
              id="grupo-cripto"
              title="Cripto"
              note={`${groups.crypto.length} activos en Solana.`}
              assets={groups.crypto}
              prices={prices}
              pricesLoading={pricesLoading}
            />
          ) : null}

          {groups.stableAndGold.length > 0 ? (
            <AssetGroup
              id="grupo-dolares-oro"
              title="Dólares y oro"
              note={`${groups.stableAndGold.length} activos: monedas estables en dólares y oro tokenizado.`}
              assets={groups.stableAndGold}
              prices={prices}
              pricesLoading={pricesLoading}
            />
          ) : null}
        </>
      ) : null}

      <BridgedNotice />
    </div>
  );
}

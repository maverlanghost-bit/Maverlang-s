import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { CryptoBuyPanel } from "@/components/domain/crypto-trade-sheet";
import { CopyButton } from "@/components/ui/copy-button";
import { IconBack } from "@/components/ui/icons";
import { site } from "@/config/site";
import { MAX_ORDER_USD } from "@/config/trade";
import {
  BRIDGED_TOKEN_NOTICE,
  LEGAL_REVIEW_NOTICE,
  LST_YIELD_NOTICE,
  NON_CUSTODY_LINE,
  USDY_YIELD_NOTICE,
} from "@/content/crypto-legal";
import { readAccountMode } from "@/lib/account/server";
import { findCryptoBySymbol } from "@/lib/catalog/crypto";
import { findEarnBySymbol } from "@/lib/catalog/lst";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

type FichaGroup = "crypto" | "dollar" | "gold" | "lst";

type Ficha = {
  symbol: string;
  name: string;
  mint: string;
  decimals: number | null;
  seal: "VERDE" | "AMARILLO" | null;
  group: FichaGroup;
  originLabel: string;
  maxOrderUsd: number;
};

const GROUP_LABEL: Record<FichaGroup, string> = {
  crypto: "Cripto",
  dollar: "Dólar",
  gold: "Oro",
  lst: "Staking",
};

/**
 * Resuelve un símbolo contra los catálogos de la tanda. Se aceptan las 29
 * criptos (K1) y los LST/USDY (K2): un LST también tiene ficha, con su aviso.
 * Cualquier otra cosa devuelve `null` y la página responde 404.
 */
function fichaFor(raw: string): Ficha | null {
  const symbol = raw.trim();
  if (!symbol) return null;

  const crypto = findCryptoBySymbol(symbol);
  if (crypto) {
    return {
      symbol: crypto.symbol,
      name: crypto.name,
      mint: crypto.mint,
      decimals: crypto.decimals ?? null,
      seal: crypto.seal,
      group: crypto.group,
      originLabel: crypto.originLabel,
      maxOrderUsd: crypto.maxOrderUsd,
    };
  }

  const lst = findEarnBySymbol(symbol);
  if (lst) {
    return {
      symbol: lst.symbol,
      name: lst.name,
      mint: lst.mint,
      decimals: lst.decimals ?? null,
      seal: null,
      group: "lst",
      originLabel: lst.issuerName,
      maxOrderUsd: MAX_ORDER_USD,
    };
  }

  return null;
}

function solscanMintUrl(mint: string) {
  return `https://solscan.io/token/${encodeURIComponent(mint)}`;
}

function Monogram({ symbol }: { symbol: string }) {
  const letters = symbol.replace(/[^A-Za-z0-9]/g, "");
  return (
    <span
      aria-hidden
      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[13px] leading-none font-medium tracking-tight text-fg-body"
    >
      {(letters.slice(0, 3) || "?").toUpperCase()}
    </span>
  );
}

/** Rótulo de contexto en mono, separado por un punto: sin cápsulas de color. */
function MetaItem({ children, separator = false }: { children: ReactNode; separator?: boolean }) {
  return (
    <li className="inline-flex shrink-0 items-center gap-3">
      {separator ? <span aria-hidden className="size-[3px] shrink-0 rounded-full bg-border-strong" /> : null}
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{children}</span>
    </li>
  );
}

/** Fila de dato con hairline: rótulo a la izquierda, valor a la derecha. */
function DataRow({ label, children, mono = true }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border/70 py-3 last:border-b-0">
      <dt className="min-w-0 flex-1 text-[13px] leading-5 text-fg-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right text-[13px] leading-5 font-medium text-fg",
          mono ? "num shrink-0 whitespace-nowrap" : "font-sans",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  const asset = fichaFor(symbol);
  // Igual que el resto de /app: esta ficha no se indexa.
  const robots = { index: false, follow: false };
  if (!asset) return { title: "Cripto no encontrada", robots };
  return {
    title: `${asset.name} (${asset.symbol})`,
    description: `Ficha de ${asset.name} (${asset.symbol}) en Solana. Compra y staking solo en la demo de ${site.name}, con saldo ficticio y sin custodia.`,
    robots,
  };
}

export default async function CriptoFichaPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const asset = fichaFor(raw);
  if (!asset) notFound();
  if (asset.symbol !== raw.trim()) redirect(`/app/cripto/${encodeURIComponent(asset.symbol)}`);

  const accountMode = await readAccountMode();
  const isLst = asset.group === "lst";
  const isUsdy = asset.symbol === "USDY";
  const backHref = isLst ? "/app/ganar" : "/app/cripto";
  const backLabel = isLst ? "Volver a Ganar" : "Volver a Cripto";

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <Link
        href={backHref}
        className="-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-fg-muted outline-none transition-colors duration-150 hover:bg-surface-1 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
      >
        <IconBack className="size-4" />
        {backLabel}
      </Link>

      <div className="flex min-w-0 flex-col gap-4">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Monogram symbol={asset.symbol} />
          <div className="min-w-0 flex-1 basis-44">
            <h1 className="max-w-full text-[27px] leading-[1.08] break-words text-balance sm:text-[32px]">
              {asset.name}
            </h1>
            <p className="num mt-1.5 max-w-full text-[13px] leading-5 break-words text-fg-muted">
              <span className="font-medium text-fg">{asset.symbol}</span>
              <span aria-hidden> · </span>
              <span className="font-sans">{asset.originLabel}</span>
            </p>
          </div>
        </header>

        <ul
          aria-label="Contexto del token"
          className="flex min-w-0 max-w-full list-none flex-wrap items-center gap-x-3 gap-y-1 p-0 font-mono text-[13px] leading-5 tracking-[0.04em] text-fg-muted uppercase"
        >
          <MetaItem>{GROUP_LABEL[asset.group]}</MetaItem>
          <MetaItem separator>Solana</MetaItem>
          {asset.seal ? (
            <MetaItem separator>
              <span className={asset.seal === "AMARILLO" ? "text-warn" : undefined}>Sello {asset.seal}</span>
            </MetaItem>
          ) : null}
        </ul>

        {asset.seal === "AMARILLO" ? (
          <p className="max-w-prose text-[13px] leading-relaxed text-fg-body">
            Sello AMARILLO: tope por orden más estricto, {formatMoney(asset.maxOrderUsd, "USD")}.
          </p>
        ) : null}
      </div>

      {/* En móvil el precio y la compra van primero; en lg, la boleta queda fija a la derecha. */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-x-16">
        <aside className="order-1 min-w-0 lg:order-2">
          <div className="lg:sticky lg:top-6">
            <CryptoBuyPanel
              symbol={asset.symbol}
              name={asset.name}
              maxOrderUsd={asset.maxOrderUsd}
              accountMode={accountMode}
            />
          </div>
        </aside>

        <div className="order-2 flex min-w-0 flex-col gap-10 lg:order-1">
          {asset.symbol === "BTC" ? (
            <p className="max-w-prose text-[13px] leading-relaxed text-fg-body">
              <span className="font-medium text-fg">BTC aquí es cbBTC de Coinbase en Solana.</span> No es Bitcoin
              nativo y no ofrecemos WBTC.
            </p>
          ) : null}

          <section aria-labelledby="datos-token" className="border-t border-border pt-8">
            <h2 id="datos-token" className="text-lg font-medium tracking-tight text-fg">
              Datos del token
            </h2>
            <dl className="mt-2">
              <DataRow label="Red">Solana</DataRow>
              <DataRow label="Versión y origen" mono={false}>
                {asset.originLabel}
              </DataRow>
              {asset.seal ? (
                <DataRow label="Sello" mono={false}>
                  {asset.seal}
                </DataRow>
              ) : null}
              <DataRow label="Decimales">{asset.decimals ?? "Sin dato"}</DataRow>
              <DataRow label="Tope por orden">{formatMoney(asset.maxOrderUsd, "USD")}</DataRow>
              <div className="py-3">
                <dt className="text-[13px] leading-5 text-fg-muted">Mint</dt>
                <dd className="mt-1.5">
                  <p className="num text-[13px] leading-5 break-all text-fg">{asset.mint}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                    <CopyButton value={asset.mint} label="Copiar mint" copiedLabel="Copiado" />
                    <a
                      href={solscanMintUrl(asset.mint)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center text-[13px] font-medium text-fg underline decoration-border underline-offset-4 outline-none focus-visible:ring-4 focus-visible:ring-fg/20"
                    >
                      Ver en Solscan
                      <span className="sr-only"> (se abre en otra pestaña)</span>
                    </a>
                  </div>
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="historial-precio" className="border-t border-border pt-8">
            <h2 id="historial-precio" className="text-lg font-medium tracking-tight text-fg">
              Historial de precio
            </h2>
            <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-fg-body">
              Sin historial en esta demo: todavía no guardamos series de {asset.symbol} y no rellenamos el gráfico
              con datos inventados.
            </p>
          </section>

          <section aria-labelledby="avisos-cripto" className="border-t border-border pt-8">
            <h2 id="avisos-cripto" className="text-lg font-medium tracking-tight text-fg">
              Avisos
            </h2>
            <div className="mt-2 flex max-w-prose flex-col gap-2 text-[13px] leading-relaxed text-fg-body">
              <p>{NON_CUSTODY_LINE}</p>
              <p>{BRIDGED_TOKEN_NOTICE}</p>
              {isUsdy ? <p>{USDY_YIELD_NOTICE}</p> : null}
              {isLst ? <p>{LST_YIELD_NOTICE}</p> : null}
              <p>{LEGAL_REVIEW_NOTICE}</p>
              <p className="text-fg-muted">Todo esto es una demo con saldo ficticio: no se mueve dinero real.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

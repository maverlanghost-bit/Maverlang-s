import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { CryptoBuyPanel } from "@/components/domain/crypto-trade-sheet";
import { Badge } from "@/components/ui/badge";
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

function shortMint(mint: string): string {
  if (mint.length <= 14) return mint;
  return `${mint.slice(0, 6)}…${mint.slice(-5)}`;
}

function Monogram({ symbol }: { symbol: string }) {
  const letters = symbol.replace(/[^A-Za-z0-9]/g, "");
  return (
    <span
      aria-hidden
      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold tracking-tight text-fg-body"
    >
      {(letters.slice(0, 3) || "?").toUpperCase()}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-fg">{children}</dd>
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
        className="-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-full bg-surface-1 px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
      >
        <IconBack className="size-4" />
        {backLabel}
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Monogram symbol={asset.symbol} />
          <div className="min-w-0 flex-1 basis-48">
            <h1 className="max-w-full text-3xl break-words text-balance sm:text-4xl">{asset.name}</h1>
            <p className="mt-1 max-w-full break-words text-sm text-fg-muted">
              <span className="num font-medium text-fg">{asset.symbol}</span>
              <span aria-hidden> · </span>
              <span>{asset.originLabel}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {asset.seal ? (
            asset.seal === "AMARILLO" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-warn-bg px-2.5 py-0.5 text-xs leading-none font-medium text-warn">
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-warn" />
                Sello AMARILLO
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-bg px-2.5 py-0.5 text-xs leading-none font-medium text-fg-muted">
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-fg-muted" />
                Sello VERDE
              </span>
            )
          ) : (
            <Badge>Ganar</Badge>
          )}
          <Badge>{GROUP_LABEL[asset.group]}</Badge>
          <Badge>Solana</Badge>
        </div>
        <p className="text-sm leading-relaxed text-fg-muted">
          {asset.seal === "VERDE"
            ? `Sello VERDE: el tope por orden es ${formatMoney(asset.maxOrderUsd, "USD")}.`
            : asset.seal === "AMARILLO"
              ? `Sello AMARILLO: tope por orden más estricto, ${formatMoney(asset.maxOrderUsd, "USD")}.`
              : `Tope por orden: ${formatMoney(asset.maxOrderUsd, "USD")}.`}
        </p>
      </header>

      <CryptoBuyPanel
        symbol={asset.symbol}
        name={asset.name}
        maxOrderUsd={asset.maxOrderUsd}
        accountMode={accountMode}
      />

      {asset.symbol === "BTC" ? (
        <p className="rounded-2xl border border-warn/40 bg-warn-bg px-4 py-3 text-sm leading-relaxed text-fg-body">
          <span className="font-medium text-fg">BTC aquí es cbBTC de Coinbase en Solana.</span> No es Bitcoin
          nativo y no ofrecemos WBTC.
        </p>
      ) : null}

      <section
        aria-labelledby="historial-precio"
        className="rounded-2xl border border-dashed border-border-strong bg-surface-1 p-5"
      >
        <h2 id="historial-precio" className="text-base font-medium text-fg">
          Historial de precio
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-fg-body">
          Sin historial en esta demo: todavía no guardamos series de {asset.symbol} y no rellenamos el gráfico
          con datos inventados.
        </p>
      </section>

      <section aria-labelledby="datos-token" className="rounded-2xl bg-surface-1 p-5 shadow-card">
        <h2 id="datos-token" className="text-base font-medium text-fg">
          Datos del token
        </h2>
        <dl className="mt-2 divide-y divide-border">
          <Row label="Red">Solana</Row>
          <Row label="Versión y origen">{asset.originLabel}</Row>
          <Row label="Mint">
            <span className="flex flex-wrap items-center justify-end gap-2">
              <span className="num font-mono text-xs break-all" title={asset.mint}>
                {shortMint(asset.mint)}
              </span>
              <CopyButton value={asset.mint} label="Copiar" copiedLabel="Copiado" />
            </span>
          </Row>
          <Row label="Decimales">{asset.decimals ?? "sin dato"}</Row>
          <Row label="Tope por orden">{formatMoney(asset.maxOrderUsd, "USD")}</Row>
          {asset.seal ? <Row label="Sello">{asset.seal}</Row> : null}
        </dl>
      </section>

      <section
        aria-labelledby="avisos-cripto"
        className="flex flex-col gap-2 border-t border-border pt-5 text-sm leading-relaxed text-fg-body"
      >
        <h2 id="avisos-cripto" className="text-base font-medium text-fg">
          Avisos
        </h2>
        <p>{NON_CUSTODY_LINE}</p>
        <p>{BRIDGED_TOKEN_NOTICE}</p>
        {isUsdy ? <p>{USDY_YIELD_NOTICE}</p> : null}
        {isLst ? <p>{LST_YIELD_NOTICE}</p> : null}
        <p>{LEGAL_REVIEW_NOTICE}</p>
        <p>Todo esto es una demo con saldo ficticio: no se mueve dinero real.</p>
      </section>
    </div>
  );
}

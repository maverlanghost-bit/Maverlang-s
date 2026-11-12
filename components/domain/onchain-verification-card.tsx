"use client";

import Link from "next/link";

import { formatMultiplier } from "@/lib/format";

/**
 * `lib/solana/explorer` no expone un helper de mint; la ficha usa este mismo
 * formato. Se mantiene local para que la tarjeta no dependa de un módulo
 * inexistente y el enlace sea verificable de punta a punta.
 */
function solscanMintUrl(mint: string) {
  return `https://solscan.io/token/${encodeURIComponent(mint)}`;
}

function Pillar({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-t border-border/70 py-3">
      <dt className="label-xs">{label}</dt>
      <dd className="mt-1 text-balance text-[13px] leading-5 font-medium break-words text-fg">{value}</dd>
    </div>
  );
}

/**
 * Respaldo del token en Solana. Sólo informa: no calcula precios ni promete
 * rendimientos. Todo dato mostrado viene de la ficha del instrumento y el
 * contrato queda auditable en el explorador público.
 */
export function OnchainVerificationCard({
  symbol,
  name,
  mint,
  issuer,
  underlying,
  multiplier,
}: {
  symbol: string;
  name: string;
  mint: string;
  issuer: string;
  underlying: string;
  multiplier: number | null;
}) {
  const multiplierLabel =
    multiplier && Number.isFinite(multiplier) ? `×${formatMultiplier(multiplier)}` : "×1,0000";

  const pillars = [
    { label: "Subyacente", value: `${underlying} (EE.UU.)` },
    { label: "Emisor regulado", value: issuer },
    { label: "Multiplicador vigente", value: multiplierLabel },
    { label: "Estándar de custodia", value: "Autocustodia en tu billetera" },
  ] as const;

  const assistantHref = `/app/asistente?ticker=${encodeURIComponent(symbol)}&q=${encodeURIComponent(
    `Analiza ${name} (${symbol}): valoración, riesgos y liquidez on-chain`,
  )}`;

  return (
    <section className="border-t border-border pt-8" data-onchain-verification={symbol}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="label">Respaldo y verificación on-chain</p>
          <h2 className="mt-1.5 text-lg font-medium tracking-tight text-fg">
            Custodia y trazabilidad en Solana
          </h2>
        </div>
        <p className="inline-flex shrink-0 items-center gap-1.5 pt-0.5 text-[11px] leading-4 text-fg-muted">
          <span className="size-1.5 shrink-0 rounded-full bg-up" aria-hidden />
          SPL Verificable · 1:1
        </p>
      </div>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-fg-muted">
        Contrato, emisor y respaldo del token {symbol}, con enlace directo al explorador público.
      </p>

      <dl className="mt-4 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {pillars.map((pillar) => (
          <Pillar key={pillar.label} label={pillar.label} value={pillar.value} />
        ))}
      </dl>

      <div className="mt-4 flex flex-col gap-1 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <a
          href={solscanMintUrl(mint)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-11 items-center rounded-md text-[13px] font-medium text-fg underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Verificar contrato en Solscan ↗
        </a>
        <Link
          href={assistantHref}
          className="inline-flex min-h-11 items-center rounded-md text-[13px] font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Radiografía IA de {symbol} →
        </Link>
      </div>
    </section>
  );
}

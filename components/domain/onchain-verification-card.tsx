"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
    <div className="rounded-xl bg-surface-2/50 px-3 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">{label}</dt>
      <dd className="mt-1 text-balance text-sm leading-5 break-words text-fg">{value}</dd>
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
    <Card className="p-5 md:p-6" data-onchain-verification={symbol}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-muted">
              Respaldo y Verificación On-Chain
            </p>
            <h2 className="mt-1 text-base font-semibold tracking-tight text-fg">
              Custodia y trazabilidad en Solana
            </h2>
            <p className="mt-1 max-w-prose text-sm leading-5 text-fg-muted">
              Contrato, emisor y respaldo del token {symbol}, con enlace directo al explorador público.
            </p>
          </div>
          <Badge tone="up" className="mt-0.5">
            SPL Verificable · 1:1
          </Badge>
        </div>

        <dl className="grid gap-2.5 sm:grid-cols-2">
          {pillars.map((pillar) => (
            <Pillar key={pillar.label} label={pillar.label} value={pillar.value} />
          ))}
        </dl>

        <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <a
            href={solscanMintUrl(mint)}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-md text-xs font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Verificar contrato en Solscan ↗
          </a>
          <Link
            href={assistantHref}
            className="rounded-md text-xs font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Radiografía IA de {symbol} →
          </Link>
        </div>
      </div>
    </Card>
  );
}

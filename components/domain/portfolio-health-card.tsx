"use client";

import Link from "next/link";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatUsd } from "@/lib/format";
import type { Position } from "@/lib/types";

/** Pregunta semilla del asistente: sólo texto, sin datos de la cartera. */
const ASSISTANT_PROMPT = "Analiza la diversificación, concentración y riesgos de mi cartera actual";

const MASK = "••";

type HealthLevel = { tone: BadgeTone; label: string };

export function PortfolioHealthCard({
  positions,
  cashUsdc,
  totalUsd,
  masked = false,
}: {
  positions: readonly Position[];
  cashUsdc: number;
  totalUsd: number;
  masked?: boolean;
}) {
  // Sin posiciones o sin total no hay nada honesto que mostrar.
  if (positions.length === 0 || totalUsd <= 0) return null;

  const investedUsd = positions.reduce(
    (sum, position) => sum + (Number.isFinite(position.valueUsd) ? position.valueUsd : 0),
    0,
  );
  const investedPct = Math.round((investedUsd / totalUsd) * 100);
  const cashPct = Math.max(0, 100 - investedPct);

  // Mayor posición por valor; empate se queda con la primera.
  let topPosition = positions[0];
  for (const position of positions) {
    if (position.valueUsd > topPosition.valueUsd) topPosition = position;
  }
  const topWeightPct = Math.round((topPosition.valueUsd / totalUsd) * 100);

  const level: HealthLevel =
    positions.length >= 3 && topWeightPct <= 45
      ? { tone: "up", label: "Cartera diversificada" }
      : topWeightPct > 60
        ? { tone: "warn", label: `Alta concentración en ${topPosition.symbol}` }
        : { tone: "neutral", label: "Diversificación moderada" };

  // Sólo para el ancho de la barra: nunca dibujar más de 100 %.
  const investedWidth = Math.min(100, Math.max(0, investedPct));
  const cashWidth = Math.max(0, 100 - investedWidth);

  const assistantHref = `/app/asistente?q=${encodeURIComponent(ASSISTANT_PROMPT)}`;

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-balance text-fg">
            Salud y diversificación de cartera
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-fg-body">
            Cómo se reparte tu cartera hoy entre acciones tokenizadas y USDC disponible. Se calcula sólo con tus
            posiciones actuales: no es una proyección ni una recomendación de inversión.
          </p>
        </div>
        <Badge tone={level.tone} className="shrink-0">
          {level.label}
        </Badge>
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
          <span className="font-medium text-fg">Invertido {investedPct}%</span>
          <span className="num text-fg-muted">
            Liquidez USDC {cashPct}%
            {masked ? null : ` · ${formatUsd(cashUsdc)}`}
          </span>
        </div>
        <div
          role="img"
          aria-label={`Reparto de tu cartera: invertido ${investedPct}%, liquidez en USDC ${cashPct}%`}
          className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-surface-3"
        >
          <span aria-hidden="true" className="h-full bg-fg" style={{ width: `${investedWidth}%` }} />
          <span aria-hidden="true" className="h-full bg-info" style={{ width: `${cashWidth}%` }} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <p className="rounded-xl border border-border/70 bg-surface-2/60 px-3 py-2.5 text-xs leading-relaxed text-fg-muted">
          Activos distintos:{" "}
          <span className="num font-semibold text-fg">{positions.length}</span>
        </p>
        <p className="rounded-xl border border-border/70 bg-surface-2/60 px-3 py-2.5 text-xs leading-relaxed text-fg-muted">
          Mayor posición:{" "}
          <span className="num font-semibold text-fg">
            {topPosition.symbol} ({masked ? MASK : `${topWeightPct}%`})
          </span>
        </p>
        <p className="rounded-xl border border-border/70 bg-surface-2/60 px-3 py-2.5 text-xs leading-relaxed text-fg-muted">
          Caja disponible:{" "}
          <span className="num font-semibold text-fg">{masked ? MASK : `${cashPct}%`}</span>
        </p>
      </div>

      <div className="mt-4">
        <Button asChild variant="secondary" size="sm">
          <Link href={assistantHref}>Evaluar mi cartera con IA →</Link>
        </Button>
      </div>
    </Card>
  );
}

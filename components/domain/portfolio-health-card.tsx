"use client";

import Link from "next/link";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
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

  const stats = [
    { label: "Activos distintos", value: String(positions.length) },
    { label: "Mayor posición", value: `${topPosition.symbol} (${masked ? MASK : `${topWeightPct}%`})` },
    { label: "Caja disponible", value: masked ? MASK : `${cashPct}%` },
  ];

  return (
    <Card className="p-4 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-balance text-fg">
            Salud y diversificación de cartera
          </h2>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-fg-muted">
            Cómo se reparte tu cartera hoy entre acciones tokenizadas y USDC disponible. Se calcula sólo con tus
            posiciones actuales: no es una proyección ni una recomendación de inversión.
          </p>
        </div>
        <Badge tone={level.tone} className="shrink-0">
          {level.label}
        </Badge>
      </div>

      <div className="mt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-[13px] text-fg-muted">
            Invertido <span className="num font-medium text-fg">{investedPct}%</span>
          </p>
          <p className="text-[13px] text-fg-muted">
            Liquidez USDC{" "}
            <span className="num font-medium text-fg">
              {cashPct}%{masked ? "" : ` · ${formatUsd(cashUsdc)}`}
            </span>
          </p>
        </div>
        <div
          role="img"
          aria-label={`Reparto de tu cartera: invertido ${investedPct}%, liquidez en USDC ${cashPct}%`}
          className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-surface-3"
        >
          <span aria-hidden="true" className="h-full bg-fg" style={{ width: `${investedWidth}%` }} />
          <span aria-hidden="true" className="h-full bg-info" style={{ width: `${cashWidth}%` }} />
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-y-3 border-t border-border pt-4 sm:grid-cols-3 sm:gap-y-0">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={cn("min-w-0 sm:pr-5", index > 0 && "sm:border-l sm:border-border sm:pl-5")}
          >
            <dt className="label">{stat.label}</dt>
            <dd className="num mt-1.5 truncate text-[15px] font-medium tracking-tight text-fg">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-5">
        <Button asChild variant="secondary" size="sm">
          <Link href={assistantHref}>Evaluar mi cartera con IA →</Link>
        </Button>
      </div>
    </Card>
  );
}

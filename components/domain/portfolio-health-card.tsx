"use client";

import Link from "next/link";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import type { Position } from "@/lib/types";

/** Pregunta semilla del asistente: sólo texto, sin datos de la cartera. */
const ASSISTANT_PROMPT = "Analiza la diversificación, concentración y riesgos de mi cartera actual";

const MASK = "••";

type HealthLevel = { tone: BadgeTone; label: string };

/**
 * Salud de la cartera como una tira de datos: reparto invertido / liquidez,
 * tres cifras y una salida al asistente. Sin cáscara de tarjeta ni adornos.
 */
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
  const investedRatio = totalUsd > 0 ? investedUsd / totalUsd : 0;
  const investedPct = Math.round(investedRatio * 100);
  const cashPct = Math.max(0, 100 - investedPct);
  // Con caja real, un "0 %" por redondeo mentiría: se muestra "<1 %".
  const cashRatio = Math.max(0, 1 - investedRatio);
  const investedLabel = investedPct === 0 && investedRatio > 0 ? "<1" : String(investedPct);
  const cashLabel = cashPct === 0 && cashRatio > 0 ? "<1" : String(cashPct);

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

  // Sólo para el ancho de la barra: nunca dibujar más de 100 %. Se usa el
  // ratio sin redondear para que la barra y las etiquetas no se contradigan.
  const investedWidth = Math.min(100, Math.max(0, investedRatio * 100));
  const cashWidth = Math.max(0, 100 - investedWidth);

  const assistantHref = `/app/asistente?q=${encodeURIComponent(ASSISTANT_PROMPT)}`;

  const stats = [
    { label: "Activos distintos", value: String(positions.length) },
    { label: "Mayor posición", value: `${topPosition.symbol} (${masked ? MASK : `${topWeightPct}%`})` },
    { label: "Caja disponible (USDC)", value: masked ? MASK : formatUsd(cashUsdc) },
  ];

  return (
    <section className="border-t border-border pt-8">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-prose">
          <h2 className="text-xl font-medium tracking-tight text-balance text-fg">
            Salud y diversificación de cartera
          </h2>
          <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-fg-muted">
            Cómo se reparte tu cartera hoy entre acciones tokenizadas y USDC. Se calcula con tus posiciones
            actuales: no es una proyección ni una recomendación.
          </p>
        </div>
        <Badge tone={level.tone} className="shrink-0">
          {level.label}
        </Badge>
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[13px] text-fg-muted">
            Invertido <span className="num font-medium text-fg">{investedLabel}%</span>
          </p>
          <p className="text-[13px] text-fg-muted">
            Liquidez USDC <span className="num font-medium text-fg">{cashLabel}%</span>
          </p>
        </div>
        <div
          role="img"
          aria-label={`Reparto de tu cartera: invertido ${investedLabel}%, liquidez en USDC ${cashLabel}%`}
          className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-3"
        >
          <span aria-hidden="true" className="h-full bg-fg" style={{ width: `${investedWidth}%` }} />
          <span aria-hidden="true" className="h-full bg-fg/15" style={{ width: `${cashWidth}%` }} />
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-y-3 border-t border-border pt-5 sm:grid-cols-3 sm:gap-y-0">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={cn("min-w-0 sm:pr-6", index > 0 && "sm:border-l sm:border-border sm:pl-6")}
          >
            <dt className="label">{stat.label}</dt>
            <dd className="num mt-1.5 truncate text-[15px] font-medium tracking-tight text-fg">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <Link
        href={assistantHref}
        className="mt-5 inline-flex min-h-11 items-center text-[13px] font-medium text-fg underline underline-offset-4 outline-none focus-visible:ring-4 focus-visible:ring-fg/20"
      >
        Evaluar mi cartera con IA →
      </Link>
    </section>
  );
}

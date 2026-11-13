"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { COVERAGE_COPY_MIN, COVERAGE_FULL_MIN } from "@/components/copy/coverage";
import { DemoMixButton } from "@/components/copy/demo-mix-button";
import { MixStep, type MixLeg } from "@/components/copy/mix-step";
import { Button } from "@/components/ui/button";
import { COPY_CTA_NOTE, COPY_REAL_DISABLED } from "@/content/copy-legal";
import { cn } from "@/lib/cn";
import { formatPortion, formatUsd } from "@/lib/format";

type CartLeg = MixLeg & { weightOriginal: number | null };

type CopyPlanView = {
  planId: string;
  legs: CartLeg[];
  coveragePct: number;
  unavailableUsd: number;
  warnings: string[];
  totalUsd: number;
};

type AccountChoice = "demo" | "real";

class PlanRequestError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = "PlanRequestError";
    this.code = code;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function legsOf(value: unknown): CartLeg[] {
  if (!Array.isArray(value)) return [];
  const legs: CartLeg[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const symbol = record ? asString(record.symbol) : null;
    const usd = record ? asNumber(record.usd) : null;
    if (!record || !symbol || usd === null || usd <= 0) continue;
    legs.push({
      symbol,
      usd,
      weightOriginal: asNumber(record.weightOriginal),
    });
  }
  return legs;
}

/** Limpia el monto a dígitos y una coma decimal de hasta 2 lugares (es-CL). */
function cleanAmount(raw: string): string {
  let text = "";
  let hasSeparator = false;
  for (const char of raw) {
    if (char >= "0" && char <= "9") text += char;
    else if ((char === "," || char === ".") && !hasSeparator) {
      text += ",";
      hasSeparator = true;
    }
  }
  const [whole = "", decimals] = text.split(",");
  const cleanWhole = whole.replace(/^0+(?=\d)/, "").slice(0, 7);
  if (decimals === undefined) return cleanWhole;
  return `${cleanWhole || "0"},${decimals.slice(0, 2)}`;
}

function parseAmount(raw: string): number | null {
  const text = cleanAmount(raw).replace(",", ".");
  if (!text || text === ".") return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/** Fila de dato con hairline: rótulo a la izquierda, valor a la derecha. */
function Row({ label, children, mono = true }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2.5 last:border-b-0">
      <dt className="min-w-0 flex-1 text-[13px] leading-5 text-fg-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right text-[13px] leading-5 font-medium break-words text-fg",
          mono ? "num tabular-nums" : "font-sans",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

const KICKER = "font-mono text-[13px] leading-5 font-medium tracking-[0.045em] text-fg-muted uppercase";

const MIX_STEPS = ["Monto", "Cuenta", "Revisar"] as const;

/** Paso actual de la mezcla. No es interactivo: sólo orienta dónde va la persona. */
function StepRail({ stage }: { stage: 1 | 2 | 3 }) {
  return (
    <ol aria-label="Pasos de la mezcla" className="flex min-w-0 items-center gap-1.5 sm:gap-2">
      {MIX_STEPS.map((label, position) => {
        const step = (position + 1) as 1 | 2 | 3;
        const current = step === stage;
        const done = step < stage;
        return (
          <li
            key={label}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex min-w-0 items-center gap-1.5 sm:gap-2",
              step < MIX_STEPS.length && "flex-1",
            )}
          >
            <span
              className={cn(
                "num flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] leading-none font-medium tabular-nums",
                current
                  ? "border-fg bg-fg text-bg"
                  : done
                    ? "border-border bg-surface-2 text-fg-muted"
                    : "border-border text-fg-subtle",
              )}
            >
              {step}
            </span>
            <span
              className={cn(
                "min-w-0 truncate text-[13px] leading-5",
                current ? "font-medium text-fg" : "text-fg-muted",
              )}
            >
              {label}
            </span>
            {step < MIX_STEPS.length ? (
              <span aria-hidden className="h-px min-w-2 flex-1 bg-border" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Carrito de la mezcla. El monto y la cuenta los elige la persona, pero las
 * piernas y los pesos SIEMPRE vienen de `/api/copy/plan`: el cliente no manda
 * pesos propios, solo el monto total y el `versionId` que vio en la ficha.
 *
 * Se lee como un checkout: pasos numerados, el monto manda y hay una sola CTA
 * por paso. Los motivos de bloqueo van SIEMPRE encima del botón.
 */
export function MixCart({
  slug,
  versionId,
  name,
  manager,
  asOfLabel,
  coveragePct,
  availableCount,
  totalCount,
  blockedReason,
  realBuyEnabled,
  initialAmount,
  adjust,
}: {
  slug: string;
  versionId: string;
  name: string;
  manager: string;
  asOfLabel: string;
  coveragePct: number;
  availableCount: number;
  totalCount: number;
  blockedReason: string | null;
  realBuyEnabled: boolean;
  initialAmount: string;
  adjust: boolean;
}) {
  const amountId = useId();
  const spreadId = useId();
  const realNoteId = useId();
  const [amountRaw, setAmountRaw] = useState(() => cleanAmount(initialAmount));
  const [account, setAccount] = useState<AccountChoice>("demo");
  const [noSpread, setNoSpread] = useState(false);
  const [plan, setPlan] = useState<CopyPlanView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSubscription, setNeedsSubscription] = useState(false);

  const amountValue = parseAmount(amountRaw);
  const stage: 1 | 2 | 3 = plan ? 3 : amountValue !== null ? 2 : 1;

  const damaged = blockedReason !== null;
  const partial = coveragePct >= COVERAGE_COPY_MIN && coveragePct < COVERAGE_FULL_MIN;

  function resetPlan() {
    setPlan(null);
    setError(null);
    setNeedsSubscription(false);
  }

  function pickAccount(next: AccountChoice) {
    if (next === "real" && !realBuyEnabled) return;
    setAccount(next);
    resetPlan();
  }

  async function armPlan() {
    if (damaged || pending) return;
    const totalUsd = parseAmount(amountRaw);
    if (totalUsd === null) {
      setError("Escribe un monto mayor a cero para armar la mezcla.");
      return;
    }
    setPending(true);
    resetPlan();
    try {
      const response = await fetch("/api/copy/plan", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          slug,
          versionId,
          totalUsd,
          account,
          spreadUnavailable: !noSpread,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const envelope = asRecord(payload);
      if (!response.ok || !envelope || envelope.ok !== true) {
        const failure = envelope ? asRecord(envelope.error) : null;
        throw new PlanRequestError(
          asString(failure?.message) ?? "No pudimos armar la mezcla. Inténtalo de nuevo.",
          asString(failure?.code),
        );
      }
      const data = asRecord(envelope.data);
      if (!data) throw new PlanRequestError("El plan llegó incompleto. Inténtalo de nuevo.", null);
      const body = asRecord(data.plan) ?? data;
      const planId = asString(body.planId);
      const legs = legsOf(body.legs);
      if (!planId || legs.length === 0) {
        throw new PlanRequestError("El plan llegó incompleto. Inténtalo de nuevo.", null);
      }
      setPlan({
        planId,
        legs,
        coveragePct: asNumber(body.coveragePct) ?? coveragePct,
        unavailableUsd: asNumber(body.unavailableUsd) ?? 0,
        warnings: Array.isArray(body.warnings)
          ? body.warnings.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [],
        totalUsd: asNumber(body.totalUsd) ?? totalUsd,
      });
    } catch (thrown) {
      if (thrown instanceof PlanRequestError && thrown.code === "COPY_SUBSCRIPTION_REQUIRED") {
        setNeedsSubscription(true);
        setError("Necesitas una suscripción a Copiar carteras para armar la mezcla.");
      } else {
        setError(thrown instanceof Error ? thrown.message : "No pudimos armar la mezcla. Inténtalo de nuevo.");
      }
    } finally {
      setPending(false);
    }
  }

  const planPartial =
    plan !== null && plan.coveragePct >= COVERAGE_COPY_MIN && plan.coveragePct < COVERAGE_FULL_MIN;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      {damaged ? null : <StepRail stage={stage} />}

      <dl className="border-t border-border/70">
        <Row label="Cartera" mono={false}>
          {name}
        </Row>
        <Row label="Gestor" mono={false}>
          {manager}
        </Row>
        <Row label="Dato al">{asOfLabel}</Row>
        <Row label="Cobertura">
          {formatPortion(coveragePct / 100)} · {availableCount} de {totalCount}
        </Row>
      </dl>

      {adjust ? (
        <p className="text-[13px] leading-relaxed text-fg-body">
          Estás revisando un ajuste: aquí se arma un{" "}
          <strong className="font-medium text-fg">plan nuevo</strong> con la composición actual. Nada se
          ejecuta hasta que lo confirmes, orden por orden.
        </p>
      ) : null}

      {damaged ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-[15px] leading-relaxed text-fg-body">
            {blockedReason}
          </p>
          <Button asChild variant="secondary" size="lg" className="min-h-12 w-full">
            <Link href={`/app/copiar/${encodeURIComponent(slug)}`}>Volver a la ficha</Link>
          </Button>
        </div>
      ) : plan ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <p className={KICKER}>Paso 3 · Revisar</p>
            <p className="num text-[28px] leading-none font-medium tracking-tight tabular-nums text-fg sm:text-[32px]">
              {formatUsd(plan.totalUsd)}
            </p>
            <p className="text-[13px] leading-5 text-fg-muted">
              {account === "demo" ? "Mezcla en demo" : "Mezcla con dinero real"} · {plan.legs.length}{" "}
              {plan.legs.length === 1 ? "orden" : "órdenes"} · cobertura{" "}
              {formatPortion(plan.coveragePct / 100)}
            </p>
          </div>

          <ol className="flex flex-col border-t border-border/70">
            {plan.legs.map((leg, position) => (
              <li
                key={`${leg.symbol}-${position}`}
                className="flex items-baseline justify-between gap-4 border-b border-border/70 py-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[15px] leading-5 font-medium break-words text-fg">{leg.symbol}</p>
                  <p className="num text-[13px] leading-5 tabular-nums text-fg-muted">
                    {leg.weightOriginal !== null
                      ? `Peso original ${formatPortion(leg.weightOriginal / 100)} · `
                      : ""}
                    Orden {position + 1} de {plan.legs.length}
                  </p>
                </div>
                <p className="num shrink-0 text-[15px] leading-5 font-medium tabular-nums text-fg">
                  {formatUsd(leg.usd)}
                </p>
              </li>
            ))}
          </ol>

          <div className="flex flex-col gap-1.5">
            {planPartial ? (
              <p className="text-[13px] leading-relaxed text-fg-body">
                Réplica parcial: parte del portafolio original no está en Maverlang. Lo que sí se puede comprar
                se reparte según el peso declarado.
              </p>
            ) : null}
            {plan.unavailableUsd > 0 ? (
              <p className="text-[13px] leading-relaxed text-fg-muted tabular-nums">
                {noSpread
                  ? `Dejamos ${formatUsd(plan.unavailableUsd)} en USDC: es lo que no está disponible en Maverlang.`
                  : `Lo no disponible (${formatUsd(plan.unavailableUsd)}) se repartió entre lo comprable; no queda saldo sin invertir.`}
              </p>
            ) : null}
            {plan.warnings.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {plan.warnings.map((warning, position) => (
                  <li key={`${position}-${warning}`} className="text-[13px] leading-relaxed text-fg-muted">
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-[13px] leading-relaxed text-fg-muted">
              El plan vence 10 minutos después de armarlo. Si vence, se arma uno nuevo con precios nuevos.
            </p>
          </div>

          {account === "demo" ? (
            <DemoMixButton planId={plan.planId} totalUsd={plan.totalUsd} onReset={resetPlan} />
          ) : realBuyEnabled ? (
            <MixStep planId={plan.planId} legs={plan.legs} totalUsd={plan.totalUsd} />
          ) : (
            <p className="text-[13px] leading-relaxed text-fg-muted">{COPY_REAL_DISABLED}</p>
          )}

          <button
            type="button"
            onClick={resetPlan}
            className="inline-flex min-h-11 items-center justify-center text-[13px] font-medium text-fg-muted underline underline-offset-4 transition-colors hover:text-fg"
          >
            Cambiar monto o cuenta
          </button>

          <p className="text-[13px] leading-relaxed text-fg-muted">{COPY_CTA_NOTE}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className={KICKER}>Paso 1 · Monto</p>
            <label htmlFor={amountId} className="text-[15px] leading-6 font-medium text-fg">
              Monto total (US$)
            </label>
            <div className="flex min-h-16 items-center gap-2 rounded-2xl border border-border-control bg-bg px-4 focus-within:border-fg">
              <span className="num shrink-0 text-lg text-fg-muted">US$</span>
              <input
                id={amountId}
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                placeholder="100"
                value={amountRaw}
                onChange={(event) => {
                  setAmountRaw(cleanAmount(event.target.value));
                  resetPlan();
                }}
                className="num min-h-16 w-full min-w-0 bg-transparent text-[28px] leading-none text-fg tabular-nums outline-none placeholder:text-fg-subtle sm:text-[32px]"
              />
            </div>
            {amountRaw.length > 0 && amountValue === null ? (
              <p role="alert" className="text-[13px] leading-5 text-down">
                Escribe un monto mayor a cero.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {["50", "100", "250", "500"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setAmountRaw(preset);
                    resetPlan();
                  }}
                  className="num inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-border-control bg-bg px-3 text-[13px] font-medium tabular-nums text-fg transition-colors hover:bg-surface-1 sm:px-4"
                >
                  US$ {preset}
                </button>
              ))}
            </div>
            <p className="text-[13px] leading-relaxed text-fg-muted">
              Mínimo US$1 por orden. Las piernas que queden bajo ese monto se descartan y su peso se reparte
              entre el resto.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className={KICKER}>Paso 2 · Cuenta</p>
            <div role="radiogroup" aria-label="Cuenta para la mezcla" className="grid grid-cols-2 gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={account === "demo"}
                onClick={() => pickAccount("demo")}
                className={cn(
                  "min-h-12 rounded-full border px-4 text-[15px] font-medium transition-colors duration-150",
                  account === "demo"
                    ? "border-fg bg-fg text-bg"
                    : "border-border-control bg-bg text-fg hover:bg-surface-1",
                )}
              >
                Demo
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={account === "real"}
                aria-disabled={!realBuyEnabled}
                aria-describedby={realBuyEnabled ? undefined : realNoteId}
                onClick={() => pickAccount("real")}
                className={cn(
                  "min-h-12 rounded-full border px-4 text-[15px] font-medium transition-colors duration-150 aria-disabled:pointer-events-none aria-disabled:opacity-40",
                  account === "real"
                    ? "border-fg bg-fg text-bg"
                    : "border-border-control bg-bg text-fg hover:bg-surface-1",
                )}
              >
                Dinero real
              </button>
            </div>
            {realBuyEnabled ? null : (
              <p id={realNoteId} className="text-[13px] leading-relaxed text-fg-muted">
                {COPY_REAL_DISABLED}
              </p>
            )}
          </div>

          <label htmlFor={spreadId} className="flex min-h-12 cursor-pointer items-start gap-3 py-2">
            <input
              id={spreadId}
              type="checkbox"
              checked={noSpread}
              onChange={(event) => {
                setNoSpread(event.target.checked);
                resetPlan();
              }}
              className="mt-0.5 size-5 shrink-0 accent-brand"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] leading-6 font-medium text-fg">
                No repartir: dejar en USDC lo no disponible
              </span>
              <span className="text-[13px] leading-relaxed text-fg-muted">
                Si lo dejas sin marcar, el peso de lo que no está en Maverlang se reparte entre lo comprable.
              </span>
            </span>
          </label>

          {partial ? (
            <p className="text-[13px] leading-relaxed text-fg-body">
              Réplica parcial: esta cartera se puede copiar, pero solo una parte del portafolio original está
              disponible en Maverlang.
            </p>
          ) : null}

          <p className="text-[13px] leading-relaxed text-fg-muted">
            {account === "demo"
              ? "Hasta 25 órdenes por mezcla en demo."
              : "Hasta 10 órdenes por mezcla con dinero real."}
          </p>

          {error ? (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-[13px] leading-relaxed text-down">
                {error}
              </p>
              {needsSubscription ? (
                <Link
                  href="/app/copiar/planes"
                  className="inline-flex min-h-11 w-fit items-center text-[13px] font-medium text-fg underline underline-offset-4"
                >
                  Ver planes
                </Link>
              ) : null}
            </div>
          ) : null}

          {amountValue !== null ? (
            <p className="text-[13px] leading-relaxed text-fg-muted">
              Vas a armar una mezcla de{" "}
              <span className="num font-medium tabular-nums text-fg-body">{formatUsd(amountValue)}</span> en{" "}
              {account === "demo" ? "la cuenta demo" : "tu cuenta real"}.
            </p>
          ) : null}

          <Button
            size="lg"
            className="min-h-12 w-full touch-manipulation text-[15px]"
            loading={pending}
            disabled={pending || amountValue === null}
            onClick={() => void armPlan()}
          >
            Armar mezcla
          </Button>

          <p className="text-[13px] leading-relaxed text-fg-muted">{COPY_CTA_NOTE}</p>
        </div>
      )}
    </div>
  );
}
